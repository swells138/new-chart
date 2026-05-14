import { NextResponse } from "next/server";
import { z } from "zod";
import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, getRequestIp } from "@/lib/rate-limit";
import type { PlaceholderPerson, RelationshipType } from "@/types/models";
import { resolveClerkUserId } from "@/lib/clerk-auth";
import { currentUser } from "@clerk/nextjs/server";
import { getActiveUserLockMessage } from "@/lib/moderation/locks";
import { findExistingUserSuggestion } from "@/lib/existing-user-suggestions";
import { sendNodeInviteEmail } from "@/lib/email";

const hasClerkKeys =
  Boolean(process.env.CLERK_SECRET_KEY) &&
  Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ||
    process.env.CLERK_PUBLISHABLE_KEY,
  );

const relationshipTypeValues = [
  "Talking",
  "Dating",
  "Situationship",
  "Exes",
  "Married",
  "Sneaky Link",
  "Lovers",
  "One Night Stand",
  "complicated",
  "FWB",
] as const;

const inviteResendWindowMs = 24 * 60 * 60 * 1000;

const createSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    offerToNameMatch: z.boolean().optional(),
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
    offerToNameMatch: z.boolean().optional(),
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

function hashInviteToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function getInviteFailureReason(error: unknown) {
  if (error instanceof Error) {
    return error.message.slice(0, 500);
  }

  return "Invite delivery failed.";
}

function getDuplicateInviteMessage(method: string) {
  return method === "phone"
    ? "An invite was already attempted for this phone number recently."
    : "An invite was already sent to this email recently.";
}

async function findRecentInvite(input: {
  placeholderId: string;
  contactValue: string;
}) {
  const since = new Date(Date.now() - inviteResendWindowMs);
  const rows = await prisma.$queryRaw<
    Array<{ status: string; contactMethod: string; sentAt: Date | null }>
  >`
    SELECT "status", "contactMethod", "sentAt"
    FROM "NodeInvite"
    WHERE "placeholderId" = ${input.placeholderId}
      AND "contactValue" = ${input.contactValue}
      AND "status" IN ('pending', 'accepted')
      AND COALESCE("sentAt", "createdAt") >= ${since}
    ORDER BY COALESCE("sentAt", "createdAt") DESC
    LIMIT 1
  `;

  return rows[0] ?? null;
}

async function insertNodeInvite(input: {
  placeholderId: string;
  ownerId: string;
  contactMethod: "email" | "phone";
  contactValue: string;
  token: string;
  status: "pending" | "failed";
  sentAt?: Date | null;
  failedAt?: Date | null;
  failureReason?: string | null;
}) {
  await prisma.$executeRaw`
    INSERT INTO "NodeInvite" (
      "id",
      "placeholderId",
      "ownerId",
      "contactMethod",
      "contactValue",
      "tokenHash",
      "status",
      "sentAt",
      "failedAt",
      "failureReason",
      "createdAt",
      "updatedAt"
    )
    VALUES (
      ${randomBytes(12).toString("hex")},
      ${input.placeholderId},
      ${input.ownerId},
      ${input.contactMethod},
      ${input.contactValue},
      ${hashInviteToken(input.token)},
      ${input.status},
      ${input.sentAt ?? null},
      ${input.failedAt ?? null},
      ${input.failureReason ?? null},
      ${new Date()},
      ${new Date()}
    )
  `;
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

async function insertLegacyCompatibleUser(
  clerkId: string,
  fallbackName: string,
) {
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
    offerToNameMatch: true,
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
  offerToNameMatch?: boolean;
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
    offerToNameMatch: p.offerToNameMatch ?? true,
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

  if (existing) {
    return existing.id;
  }

  let fallbackName = "New member";
  try {
    const clerk = await currentUser();
    const fullName = [clerk?.firstName, clerk?.lastName]
      .filter(Boolean)
      .join(" ")
      .trim();
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
    return {
      error: NextResponse.json(
        { error: "Auth is not configured." },
        { status: 503 },
      ),
    };
  }
  const userId = await resolveClerkUserId(request);
  if (!userId) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
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

    return NextResponse.json({
      placeholders: placeholders.map(normalizePlaceholder),
    });
  } catch (error) {
    console.error("Failed to load private connections", error);
    return NextResponse.json(
      { error: "Could not load your direct connections." },
      { status: 500 },
    );
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
    const lockMessage = await getActiveUserLockMessage(currentDbUserId);
    if (lockMessage) {
      return NextResponse.json({ error: lockMessage }, { status: 403 });
    }

    const ip = getRequestIp(request);
    const rateLimit = await checkRateLimit(
      `private-connections-post:${currentDbUserId}:${ip}`,
      {
        windowMs: 5 * 60 * 1000,
        maxRequests: 30,
      },
    );
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many entries. Please slow down." },
        {
          status: 429,
          headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
        },
      );
    }

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body." },
        { status: 400 },
      );
    }

    const parsed = createSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
    }

    const {
      name,
      offerToNameMatch,
      email,
      phoneNumber,
      relationshipType,
      note,
    } = parsed.data;
    const normalizedEmail = email?.trim() || null;
    const normalizedPhoneNumber = phoneNumber?.trim() || null;

    // Enforce a reasonable per-user cap (200 private entries)
    const existing = await prisma.placeholderPerson.count({
      where: { ownerId: currentDbUserId },
    });
    if (existing >= 200) {
      return NextResponse.json(
        { error: "You have reached the placeholder limit (200 entries)." },
        { status: 422 },
      );
    }

    const existingUserSuggestion = await findExistingUserSuggestion(
      { name, email: normalizedEmail, phoneNumber: normalizedPhoneNumber },
      currentDbUserId,
    );

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
          offerToNameMatch: offerToNameMatch ?? true,
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
      { status: 201 },
    );
  } catch (error) {
    const code = getPrismaErrorCode(error);
    console.error("Failed to create private connection", error);

    if (code === "P2003") {
      return NextResponse.json(
        { error: "Your profile could not be linked. Refresh and try again." },
        { status: 409 },
      );
    }

    return NextResponse.json(
      { error: "Could not add that connection right now. Please try again." },
      { status: 500 },
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
  const lockMessage = await getActiveUserLockMessage(currentDbUserId);
  if (lockMessage) {
    return NextResponse.json({ error: lockMessage }, { status: 403 });
  }

  const ip = getRequestIp(request);
  const rateLimit = await checkRateLimit(
    `private-connections-patch:${currentDbUserId}:${ip}`,
    {
      windowMs: 5 * 60 * 1000,
      maxRequests: 60,
    },
  );
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please slow down." },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
      },
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

  const {
    id,
    action,
    name,
    offerToNameMatch,
    email,
    phoneNumber,
    relationshipType,
    note,
  } = parsed.data;

  const existing = await prisma.placeholderPerson.findUnique({
    where: { id },
    select: {
      id: true,
      ownerId: true,
      name: true,
      email: true,
      phoneNumber: true,
      relationshipType: true,
      note: true,
      inviteToken: true,
      linkedUserId: true,
      claimStatus: true,
      createdAt: true,
      offerToNameMatch: true,
    },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  if (existing.ownerId !== currentDbUserId) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  if (action === "generateInvite") {
    const targetEmail = (existing.email ?? "").trim();
    const targetPhone = (existing.phoneNumber ?? "").trim();
    const contactMethod = targetEmail ? "email" : targetPhone ? "phone" : null;
    const contactValue = targetEmail || targetPhone;

    if (!contactMethod || !contactValue) {
      return NextResponse.json(
        {
          error: "Add an email or phone number before sending an invite.",
        },
        { status: 422 },
      );
    }

    const inviteSendLimit = await checkRateLimit(
      `private-connections-invite-send:${currentDbUserId}:${contactValue}`,
      {
        windowMs: 60 * 60 * 1000,
        maxRequests: 3,
      },
    );
    if (!inviteSendLimit.allowed) {
      return NextResponse.json(
        { error: "Too many invite attempts. Please try again later." },
        {
          status: 429,
          headers: {
            "Retry-After": String(inviteSendLimit.retryAfterSeconds),
          },
        },
      );
    }

    const recentInvite = await findRecentInvite({
      placeholderId: existing.id,
      contactValue,
    });
    if (recentInvite) {
      return NextResponse.json(
        { error: getDuplicateInviteMessage(recentInvite.contactMethod) },
        { status: 429 },
      );
    }

    const token = randomBytes(24).toString("hex");
    const updated = await prisma.placeholderPerson.update({
      where: { id },
      data: {
        inviteToken: token,
        claimStatus:
          existing.claimStatus === "unclaimed"
            ? "invited"
            : existing.claimStatus,
      },
    });

    if (contactMethod === "phone") {
      const failureReason =
        "Phone invite UI is ready, but SMS delivery is not connected yet.";
      await insertNodeInvite({
        placeholderId: updated.id,
        ownerId: existing.ownerId,
        contactMethod,
        contactValue,
        token,
        status: "failed",
        failedAt: new Date(),
        failureReason,
      });

      return NextResponse.json(
        {
          error:
            "Phone invites are not connected yet. Add an email to send an invite now.",
          placeholder: normalizePlaceholder(updated),
        },
        { status: 501 },
      );
    }

    try {
      const owner = await prisma.user.findUnique({
        where: { id: existing.ownerId },
        select: { name: true, handle: true },
      });
      const ownerName = owner?.name ?? owner?.handle ?? "Someone";
      await sendNodeInviteEmail({
        to: contactValue,
        token,
        inviterName: ownerName,
      });
      await insertNodeInvite({
        placeholderId: updated.id,
        ownerId: existing.ownerId,
        contactMethod,
        contactValue,
        token,
        status: "pending",
        sentAt: new Date(),
      });
    } catch (e) {
      const failureReason = getInviteFailureReason(e);
      await insertNodeInvite({
        placeholderId: updated.id,
        ownerId: existing.ownerId,
        contactMethod,
        contactValue,
        token,
        status: "failed",
        failedAt: new Date(),
        failureReason,
      });
      console.error("Failed to send invite email:", e);
      return NextResponse.json(
        {
          error: "Could not send invite. Please try again.",
          placeholder: normalizePlaceholder(updated),
        },
        { status: 502 },
      );
    }
    return NextResponse.json({
      placeholder: normalizePlaceholder(updated),
      message: "Invite sent.",
    });
  }

  if (action === "revokeInvite") {
    // Only revoke if the invite hasn't been claimed yet
    if (existing.claimStatus === "claimed") {
      return NextResponse.json(
        { error: "Cannot revoke a claimed invite." },
        { status: 409 },
      );
    }
    const updated = await prisma.placeholderPerson.update({
      where: { id },
      data: { inviteToken: null, claimStatus: "unclaimed" },
    });
    return NextResponse.json({ placeholder: normalizePlaceholder(updated) });
  }

  // Default: "update" — patch name/type/note
  // Determine whether the update changes any meaningful fields.
  const willModifyFields =
    name !== undefined ||
    offerToNameMatch !== undefined ||
    email !== undefined ||
    phoneNumber !== undefined ||
    relationshipType !== undefined ||
    note !== undefined;

  // If this placeholder was previously claimed and the owner changes it,
  // revert it to private (unclaimed) until verified again. Also clear any
  // linked user and invite token so the claim must be re-established.
  const revokeClaim = existing.claimStatus === "claimed" && willModifyFields;

  const updated = await prisma.placeholderPerson.update({
    where: { id },
    data: {
      ...(name !== undefined && { name: name.trim() }),
      ...(offerToNameMatch !== undefined && { offerToNameMatch }),
      ...(email !== undefined && { email: email.trim() || null }),
      ...(phoneNumber !== undefined && {
        phoneNumber: phoneNumber.trim() || null,
      }),
      ...(relationshipType !== undefined && { relationshipType }),
      ...(note !== undefined && { note: note.trim() }),
      ...(revokeClaim && { claimStatus: "unclaimed" }),
      ...(revokeClaim && { linkedUserId: null }),
      ...(revokeClaim && { inviteToken: null }),
    },
  });

  return NextResponse.json({ placeholder: normalizePlaceholder(updated) });
}

// ───────────────────────────────────────────────
// DELETE — remove a private connection
// ───────────────────────────────────────────────
export async function DELETE(request: Request) {
  try {
    const authResult = await getAuthenticatedDbUserId(request);
    if (authResult.error) return authResult.error;
    const currentDbUserId = authResult.dbUserId;
    const lockMessage = await getActiveUserLockMessage(currentDbUserId);
    if (lockMessage) {
      return NextResponse.json({ error: lockMessage }, { status: 403 });
    }

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body." },
        { status: 400 },
      );
    }

    const parsed = deleteSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
    }

    const { id } = parsed.data;

    // Use a minimal select to avoid P2022 schema-drift errors on newer columns
    const existing = await prisma.placeholderPerson.findUnique({
      where: { id },
      select: { id: true, ownerId: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }

    // Allow deletion by owner; if available, also allow the linked (claimed) user.
    let canDelete = existing.ownerId === currentDbUserId;
    if (!canDelete) {
      try {
        const withLinkedUser = await prisma.placeholderPerson.findUnique({
          where: { id },
          select: { linkedUserId: true },
        });
        canDelete = withLinkedUser?.linkedUserId === currentDbUserId;
      } catch (permissionError) {
        const code = getPrismaErrorCode(permissionError);
        if (code !== "P2022" && code !== "P2021") {
          throw permissionError;
        }
      }
    }

    if (!canDelete) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    try {
      await prisma.placeholderPerson.delete({ where: { id } });
    } catch (deleteError) {
      const code = getPrismaErrorCode(deleteError);
      if (code === "P2022" || code === "P2021") {
        // Schema drift: fall back to raw SQL delete
        await prisma.$executeRaw`DELETE FROM "PlaceholderPerson" WHERE "id" = ${id}`;
      } else {
        throw deleteError;
      }
    }

    return NextResponse.json({ deleted: true, id });
  } catch (error) {
    // Log the full error server-side for debugging
    console.error("Failed to delete private connection", error);

    // Include additional details in the JSON response when not in production
    const code = getPrismaErrorCode(error);
    const details = (() => {
      try {
        // Prefer error.message if available
        if (error && typeof error === "object" && "message" in error) {
          const e = error as Record<string, unknown>;
          const m = e.message;
          return typeof m === "string" ? m : String(m);
        }
        return String(error);
      } catch {
        return undefined;
      }
    })();

    const responseBody: Record<string, unknown> = {
      error: "Could not delete this connection.",
    };

    if (code) responseBody.prismaCode = code;
    if (process.env.NODE_ENV !== "production") {
      responseBody.details = details;
    }

    return NextResponse.json(responseBody, { status: 500 });
  }
}

export const PRIVATE_CONNECTIONS_API = "/api/private-connections";

/**
 * Private Connections API quick reference
 * - GET  -> list private connections
 * - POST -> create a placeholder
 * - PATCH -> update / generateInvite / revokeInvite  <-- Edit handler
 * - DELETE -> remove placeholder
 *
 * Import `PRIVATE_CONNECTIONS_API` from this file when calling the endpoint
 * from client code so the endpoint string is centralized and the implementation
 * is easy to locate: src/app/api/private-connections/route.ts
 */

// ===== PATCH (EDIT) HANDLER — easy to locate =====
// The PATCH handler below updates a placeholder (or generates/revokes an invite).
// It supports rate limiting, input validation, and error handling.
// The logic is organized in a procedural style for clarity.
// Consider refactoring to a more declarative approach if modifying significantly.
