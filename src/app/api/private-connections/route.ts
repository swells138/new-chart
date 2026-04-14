import { NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, getRequestIp } from "@/lib/rate-limit";
import type { PlaceholderPerson, RelationshipType } from "@/types/models";
import { resolveClerkUserId } from "@/lib/clerk-auth";
import { currentUser } from "@clerk/nextjs/server";

const hasClerkKeys =
  Boolean(process.env.CLERK_SECRET_KEY) &&
  Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ||
      process.env.CLERK_PUBLISHABLE_KEY
  );

const relationshipTypeValues = [
  "Talking",
  "Dating",
  "Situationship",
  "Exes",
  "Married",
  "Sneaky Link",
  "Friends",
  "Lovers",
  "One Night Stand",
  "complicated",
  "FWB",
] as const;

const createSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    email: z.string().trim().email().max(200).optional().or(z.literal("")),
    phoneNumber: z.string().trim().max(40).optional().or(z.literal("")),
    relationshipType: z.enum(relationshipTypeValues),
    note: z.string().trim().max(500).optional(),
  })
  .strict();

const updateSchema = z
  .object({
    id: z.string().trim().min(1).max(100),
    action: z
      .enum(["update", "generateInvite", "revokeInvite"])
      .optional()
      .default("update"),
    name: z.string().trim().min(1).max(80).optional(),
    email: z.string().trim().email().max(200).optional().or(z.literal("")),
    phoneNumber: z.string().trim().max(40).optional().or(z.literal("")),
    relationshipType: z.enum(relationshipTypeValues).optional(),
    note: z.string().trim().max(500).optional(),
  })
  .strict();

const deleteSchema = z
  .object({
    id: z.string().trim().min(1).max(100),
  })
  .strict();

function getPrismaErrorCode(error: unknown) {
  if (typeof error === "object" && error !== null && "code" in error) {
    const maybeCode = (error as { code?: unknown }).code;
    return typeof maybeCode === "string" ? maybeCode : null;
  }

  return null;
}

function makeLegacyUserId(clerkId: string) {
  const cleaned = clerkId.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  const seed = cleaned.slice(-10) || "member";
  const rand = Math.random().toString(36).slice(2, 10);
  return `c${seed}${Date.now().toString(36)}${rand}`.slice(0, 50);
}

function makeLegacyPlaceholderId(ownerId: string) {
  const cleaned = ownerId.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  const seed = cleaned.slice(-10) || "node";
  const rand = Math.random().toString(36).slice(2, 10);
  return `p${seed}${Date.now().toString(36)}${rand}`.slice(0, 50);
}

async function insertLegacyCompatibleUser(clerkId: string, fallbackName: string) {
  const id = makeLegacyUserId(clerkId);
  const now = new Date();

  await prisma.$executeRaw`
    INSERT INTO "User" ("id", "clerkId", "name", "createdAt", "updatedAt")
    VALUES (${id}, ${clerkId}, ${fallbackName}, ${now}, ${now})
    ON CONFLICT ("clerkId") DO NOTHING
  `;
}

async function insertLegacyPlaceholder(data: {
  ownerId: string;
  name: string;
  relationshipType: string;
}) {
  const id = makeLegacyPlaceholderId(data.ownerId);
  const now = new Date();

  await prisma.$executeRaw`
    INSERT INTO "PlaceholderPerson" ("id", "ownerId", "name", "relationshipType", "createdAt", "updatedAt")
    VALUES (${id}, ${data.ownerId}, ${data.name}, ${data.relationshipType}, ${now}, ${now})
  `;

  return {
    id,
    ownerId: data.ownerId,
    name: data.name,
    email: null,
    phoneNumber: null,
    relationshipType: data.relationshipType,
    note: null,
    inviteToken: null,
    linkedUserId: null,
    claimStatus: "unclaimed",
    createdAt: now,
  };
}

function normalizePlaceholder(p: {
  id: string;
  ownerId: string;
  name: string;
  email: string | null;
  phoneNumber: string | null;
  relationshipType: string;
  note: string | null;
  inviteToken: string | null;
  linkedUserId: string | null;
  claimStatus: string;
  createdAt: Date;
}): PlaceholderPerson {
  return {
    id: p.id,
    ownerId: p.ownerId,
    name: p.name,
    email: p.email ?? "",
    phoneNumber: p.phoneNumber ?? "",
    relationshipType: p.relationshipType as RelationshipType,
    note: p.note ?? "",
    inviteToken: p.inviteToken,
    linkedUserId: p.linkedUserId,
    claimStatus: p.claimStatus as PlaceholderPerson["claimStatus"],
    createdAt: p.createdAt.toISOString(),
  };
}

interface ExistingUserSuggestion {
  kind: "existing-user";
  user: {
    id: string;
    name: string | null;
    handle: string | null;
  };
  message: string;
}

async function getOrCreateCurrentDbUserId(clerkId: string) {
  const existing = await prisma.user.findUnique({
    where: { clerkId },
    select: { id: true },
  });

  if (existing) {
    return existing.id;
  }

  let fallbackName = "New member";
  try {
    const clerk = await currentUser();
    const fullName = [clerk?.firstName, clerk?.lastName].filter(Boolean).join(" ").trim();
    fallbackName = fullName || clerk?.username || fallbackName;
  } catch {
    // Bearer-token auth can succeed without a request-bound Clerk session.
  }

  try {
    const created = await prisma.user.create({
      data: {
        clerkId,
        name: fallbackName,
      },
      select: { id: true },
    });

    return created.id;
  } catch (error) {
    const code = getPrismaErrorCode(error);
    if (code === "P2002") {
      const retry = await prisma.user.findUnique({
        where: { clerkId },
        select: { id: true },
      });

      if (retry) {
        return retry.id;
      }
    }

    if (code === "P2022") {
      await insertLegacyCompatibleUser(clerkId, fallbackName);

      const legacyRetry = await prisma.user.findUnique({
        where: { clerkId },
        select: { id: true },
      });

      if (legacyRetry) {
        return legacyRetry.id;
      }
    }

    throw error;
  }
}

async function getAuthenticatedDbUserId(request: Request) {
  if (!hasClerkKeys) {
    return { error: NextResponse.json({ error: "Auth is not configured." }, { status: 503 }) };
  }
  const userId = await resolveClerkUserId(request);
  if (!userId) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const dbUserId = await getOrCreateCurrentDbUserId(userId);
  return { dbUserId };
}

// ───────────────────────────────────────────────
// GET — list the current user's private connections
// ───────────────────────────────────────────────
export async function GET(request: Request) {
  try {
    const authResult = await getAuthenticatedDbUserId(request);
    if (authResult.error) return authResult.error;
    const currentDbUserId = authResult.dbUserId;

    const placeholders = await prisma.placeholderPerson.findMany({
      where: {
        ownerId: currentDbUserId,
        claimStatus: { in: ["unclaimed", "invited"] },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ placeholders: placeholders.map(normalizePlaceholder) });
  } catch (error) {
    console.error("Failed to load private connections", error);
    return NextResponse.json({ error: "Could not load your direct connections." }, { status: 500 });
  }
}

// ───────────────────────────────────────────────
// POST — add someone as a placeholder node (no account required for target)
// ───────────────────────────────────────────────
export async function POST(request: Request) {
  try {
    const authResult = await getAuthenticatedDbUserId(request);
    if (authResult.error) return authResult.error;
    const currentDbUserId = authResult.dbUserId;

    const ip = getRequestIp(request);
    const rateLimit = await checkRateLimit(`private-connections-post:${currentDbUserId}:${ip}`, {
      windowMs: 5 * 60 * 1000,
      maxRequests: 30,
    });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many entries. Please slow down." },
        { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
      );
    }

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const parsed = createSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
    }

    const { name, email, phoneNumber, relationshipType, note } = parsed.data;
    const normalizedEmail = email?.trim() || null;
    const normalizedPhoneNumber = phoneNumber?.trim() || null;

    // Enforce a reasonable per-user cap (200 private entries)
    const existing = await prisma.placeholderPerson.count({ where: { ownerId: currentDbUserId } });
    if (existing >= 200) {
      return NextResponse.json(
        { error: "You have reached the placeholder limit (200 entries)." },
        { status: 422 }
      );
    }

    let existingUserSuggestion: ExistingUserSuggestion | null = null;
    if (normalizedEmail || normalizedPhoneNumber) {
      const existingUser = await prisma.user.findFirst({
        where: {
          id: { not: currentDbUserId },
          OR: [
            ...(normalizedEmail ? [{ email: normalizedEmail }] : []),
            ...(normalizedPhoneNumber ? [{ phoneNumber: normalizedPhoneNumber }] : []),
          ],
        },
        select: {
          id: true,
          name: true,
          handle: true,
        },
      });

      if (existingUser) {
        existingUserSuggestion = {
          kind: "existing-user",
          user: {
            id: existingUser.id,
            name: existingUser.name,
            handle: existingUser.handle,
          },
          message:
            "This contact already appears to be a Chart user. You can keep this as a private node, but consider adding a public connection too.",
        };
      }
    }

    let placeholder: {
      id: string;
      ownerId: string;
      name: string;
      email: string | null;
      phoneNumber: string | null;
      relationshipType: string;
      note: string | null;
      inviteToken: string | null;
      linkedUserId: string | null;
      claimStatus: string;
      createdAt: Date;
    };

    try {
      placeholder = await prisma.placeholderPerson.create({
        data: {
          ownerId: currentDbUserId,
          name: name.trim(),
          email: normalizedEmail,
          phoneNumber: normalizedPhoneNumber,
          relationshipType,
          note: note?.trim() ?? null,
          claimStatus: "unclaimed",
        },
      });
    } catch (error) {
      const code = getPrismaErrorCode(error);
      if (code !== "P2022") {
        throw error;
      }

      placeholder = await insertLegacyPlaceholder({
        ownerId: currentDbUserId,
        name: name.trim(),
        relationshipType,
      });
    }

    return NextResponse.json(
      {
        placeholder: normalizePlaceholder(placeholder),
        suggestion: existingUserSuggestion,
      },
      { status: 201 }
    );
  } catch (error) {
    const code = getPrismaErrorCode(error);
    console.error("Failed to create private connection", error);

    if (code === "P2003") {
      return NextResponse.json(
        { error: "Your profile could not be linked. Refresh and try again." },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: "Could not add that connection right now. Please try again." },
      { status: 500 }
    );
  }
}

// ───────────────────────────────────────────────
// PATCH — update / generate invite / revoke invite
// ───────────────────────────────────────────────
export async function PATCH(request: Request) {
  const authResult = await getAuthenticatedDbUserId(request);
  if (authResult.error) return authResult.error;
  const currentDbUserId = authResult.dbUserId;

  const ip = getRequestIp(request);
  const rateLimit = await checkRateLimit(`private-connections-patch:${currentDbUserId}:${ip}`, {
    windowMs: 5 * 60 * 1000,
    maxRequests: 60,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please slow down." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = updateSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const { id, action, name, email, phoneNumber, relationshipType, note } = parsed.data;

  const existing = await prisma.placeholderPerson.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  if (existing.ownerId !== currentDbUserId) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  if (action === "generateInvite") {
    // Idempotent — return existing token if already generated
    const token = existing.inviteToken ?? randomBytes(24).toString("hex");
    const updated = await prisma.placeholderPerson.update({
      where: { id },
      data: {
        inviteToken: token,
        claimStatus: existing.claimStatus === "unclaimed" ? "invited" : existing.claimStatus,
      },
    });
    return NextResponse.json({ placeholder: normalizePlaceholder(updated) });
  }

  if (action === "revokeInvite") {
    // Only revoke if the invite hasn't been claimed yet
    if (existing.claimStatus === "claimed") {
      return NextResponse.json({ error: "Cannot revoke a claimed invite." }, { status: 409 });
    }
    const updated = await prisma.placeholderPerson.update({
      where: { id },
      data: { inviteToken: null, claimStatus: "unclaimed" },
    });
    return NextResponse.json({ placeholder: normalizePlaceholder(updated) });
  }

  // Default: "update" — patch name/type/note
  const updated = await prisma.placeholderPerson.update({
    where: { id },
    data: {
      ...(name !== undefined && { name: name.trim() }),
      ...(email !== undefined && { email: email.trim() || null }),
      ...(phoneNumber !== undefined && { phoneNumber: phoneNumber.trim() || null }),
      ...(relationshipType !== undefined && { relationshipType }),
      ...(note !== undefined && { note: note.trim() }),
    },
  });

  return NextResponse.json({ placeholder: normalizePlaceholder(updated) });
}

// ───────────────────────────────────────────────
// DELETE — remove a private connection
// ───────────────────────────────────────────────
export async function DELETE(request: Request) {
  const authResult = await getAuthenticatedDbUserId(request);
  if (authResult.error) return authResult.error;
  const currentDbUserId = authResult.dbUserId;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = deleteSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const { id } = parsed.data;

  const existing = await prisma.placeholderPerson.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  if (existing.ownerId !== currentDbUserId) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  await prisma.placeholderPerson.delete({ where: { id } });

  return NextResponse.json({ deleted: true, id });
}
