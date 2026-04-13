import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, getRequestIp } from "@/lib/rate-limit";
import type { PlaceholderPerson, RelationshipType } from "@/types/models";

const hasClerkKeys =
  Boolean(process.env.CLERK_SECRET_KEY) &&
  Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ||
      process.env.CLERK_PUBLISHABLE_KEY
  );

async function resolveClerkUserId() {
  try {
    const { userId } = await auth();
    if (userId) {
      return userId;
    }
  } catch {
    // Fall through to currentUser() when auth() cannot resolve a session.
  }

  try {
    const clerk = await currentUser();
    return clerk?.id ?? null;
  } catch {
    return null;
  }
}

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

async function getOrCreateCurrentDbUserId(clerkId: string) {
  const existing = await prisma.user.findUnique({
    where: { clerkId },
    select: { id: true },
  });
  if (existing) return existing.id;

  const clerk = await currentUser();
  const fullName = [clerk?.firstName, clerk?.lastName].filter(Boolean).join(" ").trim();

  try {
    const created = await prisma.user.create({
      data: { clerkId, name: fullName || clerk?.username || "New member" },
      select: { id: true },
    });
    return created.id;
  } catch (error) {
    const prismaError = error as { code?: string };
    if (prismaError.code === "P2002") {
      const retry = await prisma.user.findUnique({ where: { clerkId }, select: { id: true } });
      if (retry) return retry.id;
    }
    throw error;
  }
}

async function getAuthenticatedDbUserId() {
  if (!hasClerkKeys) {
    return { error: NextResponse.json({ error: "Auth is not configured." }, { status: 503 }) };
  }
  const userId = await resolveClerkUserId();
  if (!userId) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const dbUserId = await getOrCreateCurrentDbUserId(userId);
  return { dbUserId };
}

// ───────────────────────────────────────────────
// GET — list the current user's private connections
// ───────────────────────────────────────────────
export async function GET() {
  const authResult = await getAuthenticatedDbUserId();
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
}

// ───────────────────────────────────────────────
// POST — add someone as a placeholder node (no account required for target)
// ───────────────────────────────────────────────
export async function POST(request: Request) {
  const authResult = await getAuthenticatedDbUserId();
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

  // Enforce a reasonable per-user cap (200 private entries)
  const existing = await prisma.placeholderPerson.count({ where: { ownerId: currentDbUserId } });
  if (existing >= 200) {
    return NextResponse.json(
      { error: "You have reached the placeholder limit (200 entries)." },
      { status: 422 }
    );
  }

  const placeholder = await prisma.placeholderPerson.create({
    data: {
      ownerId: currentDbUserId,
      name: name.trim(),
      email: email?.trim() || null,
      phoneNumber: phoneNumber?.trim() || null,
      relationshipType,
      note: note?.trim() ?? null,
      claimStatus: "unclaimed",
    },
  });

  return NextResponse.json({ placeholder: normalizePlaceholder(placeholder) }, { status: 201 });
}

// ───────────────────────────────────────────────
// PATCH — update / generate invite / revoke invite
// ───────────────────────────────────────────────
export async function PATCH(request: Request) {
  const authResult = await getAuthenticatedDbUserId();
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
  const authResult = await getAuthenticatedDbUserId();
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
