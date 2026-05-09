import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, getRequestIp } from "@/lib/rate-limit";
import type { RelationshipType } from "@/types/models";
import { resolveClerkUserId } from "@/lib/clerk-auth";
import { ensureDbUserIdByClerkId } from "@/lib/db-user-bootstrap";
import { getActiveUserLockMessage } from "@/lib/moderation/locks";
import { createModerationReport } from "@/lib/moderation/reports";
import { recalculateConnectionScoresForUsers } from "@/lib/connection-score";
import {
  buildClaimMetaNote,
  composeClaimMeta,
  encodePendingType,
  hasExpiredPendingConfirmation,
  parseStoredRelationshipType,
} from "@/lib/relationship-claim-status";

const hasClerkKeys =
  Boolean(process.env.CLERK_SECRET_KEY) &&
  Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ||
      process.env.CLERK_PUBLISHABLE_KEY
  );

const claimDebugEnabled =
  process.env.DEBUG_CLAIMS === "1" || process.env.NODE_ENV !== "production";

function logClaimDebug(event: string, details?: Record<string, unknown>) {
  if (!claimDebugEnabled) {
    return;
  }

  console.info("[claim-debug]", event, details ?? {});
}

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

const relationshipTypes: RelationshipType[] = [...relationshipTypeValues];

const createRelationshipSchema = z
  .object({
    source: z.string().trim().min(1).max(100),
    target: z.string().trim().min(1).max(100),
    type: z.enum(relationshipTypeValues),
  })
  .strict();

const updateRelationshipSchema = z
  .object({
    id: z.string().trim().min(1).max(100),
    type: z.enum(relationshipTypeValues).optional(),
    action: z
      .enum([
        "approve",
        "confirmCreator",
        "reject",
        "dispute",
        "requestPublic",
        "approvePublic",
        "denyPublic",
      ])
      .optional(),
    actorNodeId: z.string().trim().min(1).max(100),
    note: z.string().max(500).optional(),
  })
  .strict();

const deleteRelationshipSchema = z
  .object({
    id: z.string().trim().min(1).max(100),
    actorNodeId: z.string().trim().min(1).max(100),
  })
  .strict();

const approvalInboxLink = "/map?chart=public&focus=approvals#pending-verification";

function normalizeRelationship(relationship: {
  id: string;
  user1Id: string;
  user2Id: string;
  type: string;
  note?: string | null;
  isPublic?: boolean;
  publicRequestedBy?: string | null;
}) {
  const parsedType = parseStoredRelationshipType(
    relationship.type,
    relationship.user1Id,
    relationship.user2Id,
  );
  const claimMeta = composeClaimMeta({
    storedType: relationship.type,
    user1Id: relationship.user1Id,
    user2Id: relationship.user2Id,
    note: relationship.note,
  });

  return {
    id: relationship.id,
    source: relationship.user1Id,
    target: relationship.user2Id,
    type: relationshipTypes.includes(parsedType.baseType)
      ? parsedType.baseType
      : "Talking",
    isPublic: relationship.isPublic ?? false,
    publicRequestedBy: relationship.publicRequestedBy ?? null,
    note: claimMeta.status === "active" ? "" : buildClaimMetaNote(claimMeta),
  };
}

async function sendNotification(senderId: string, recipientId: string, content: string) {
  try {
    await prisma.message.create({
      data: { senderId, recipientId, content },
    });
  } catch (err) {
    console.error("Failed to send notification message", err);
  }
}

async function getOrCreateCurrentDbUserId(clerkId: string) {
  return ensureDbUserIdByClerkId(clerkId);
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

export async function POST(request: Request) {
  const authResult = await getAuthenticatedDbUserId(request);
  if (authResult.error) {
    return authResult.error;
  }

  const currentDbUserId = authResult.dbUserId;
  const lockMessage = await getActiveUserLockMessage(currentDbUserId);
  if (lockMessage) {
    return NextResponse.json({ error: lockMessage }, { status: 403 });
  }

  const ip = getRequestIp(request);
  const rateLimit = await checkRateLimit(`relationships-post:${currentDbUserId}:${ip}`, {
    windowMs: 5 * 60 * 1000,
    maxRequests: 40,
  });

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many connection requests. Please try again shortly." },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateLimit.retryAfterSeconds),
        },
      }
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsedPayload = createRelationshipSchema.safeParse(payload);
  if (!parsedPayload.success) {
    return NextResponse.json({ error: "Invalid relationship payload." }, { status: 400 });
  }

  const { source, target, type } = parsedPayload.data;

  if (!source || !target) {
    return NextResponse.json({ error: "A source and target node are required." }, { status: 400 });
  }

  if (source === target) {
    return NextResponse.json({ error: "A user cannot connect to themselves." }, { status: 400 });
  }

  if (source !== currentDbUserId) {
    return NextResponse.json(
      { error: "You can only create connections from your own node." },
      { status: 403 }
    );
  }

  if (target === currentDbUserId) {
    return NextResponse.json(
      { error: "Choose another member to connect with." },
      { status: 400 }
    );
  }

  const [user1Id, user2Id] = [source, target].sort();
  const requesterId = currentDbUserId;
  const responderId = source === currentDbUserId ? target : source;

  const users = await prisma.user.findMany({
    where: {
      id: { in: [user1Id, user2Id] },
    },
    select: { id: true },
  });

  if (users.length !== 2) {
    return NextResponse.json({ error: "Both nodes must reference existing users." }, { status: 404 });
  }

  const existing = await prisma.relationship.findFirst({
    where: {
      OR: [
        { user1Id, user2Id },
        { user1Id: user2Id, user2Id: user1Id },
      ],
    },
  });

  if (existing) {
    return NextResponse.json({ error: "These users are already connected." }, { status: 409 });
  }

  try {
    const relationship = await prisma.relationship.create({
      data: {
        user1Id,
        user2Id,
        type: encodePendingType(type, requesterId, responderId),
        note: buildClaimMetaNote({
          status: "pending_claim",
          creatorId: requesterId,
          claimedByUserId: responderId,
          claimConfirmedAt: null,
          expiresAt: null,
          disputeReason: null,
        }),
      },
    });
    await recalculateConnectionScoresForUsers([user1Id, user2Id]);

    await sendNotification(
      requesterId,
      responderId,
      `You have a new connection request (${type}). Review it on ${approvalInboxLink}.`
    );

    return NextResponse.json({ relationship: normalizeRelationship(relationship) }, { status: 201 });
  } catch (error) {
    const prismaError = error as { code?: string };

    if (prismaError.code === "P2002") {
      return NextResponse.json({ error: "These users are already connected." }, { status: 409 });
    }

    console.error("Failed to create relationship", error);
    return NextResponse.json({ error: "Failed to create relationship." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const authResult = await getAuthenticatedDbUserId(request);
  if (authResult.error) {
    return authResult.error;
  }

  const currentDbUserId = authResult.dbUserId;
  const lockMessage = await getActiveUserLockMessage(currentDbUserId);
  if (lockMessage) {
    return NextResponse.json({ error: lockMessage }, { status: 403 });
  }

  const ip = getRequestIp(request);
  const rateLimit = await checkRateLimit(`relationships-patch:${currentDbUserId}:${ip}`, {
    windowMs: 5 * 60 * 1000,
    maxRequests: 60,
  });

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many connection updates. Please try again shortly." },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateLimit.retryAfterSeconds),
        },
      }
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsedPayload = updateRelationshipSchema.safeParse(payload);
  if (!parsedPayload.success) {
    return NextResponse.json({ error: "Invalid relationship payload." }, { status: 400 });
  }

  const { id, type, action, actorNodeId } = parsedPayload.data;

  if (action === "approve" || action === "confirmCreator" || action === "reject" || action === "dispute") {
    logClaimDebug("relationships.patch.claim-action.start", {
      relationshipId: id,
      action,
      actorNodeId,
    });
  }

  if (!actorNodeId || actorNodeId !== currentDbUserId) {
    return NextResponse.json(
      { error: "You can only update connections from your own node." },
      { status: 403 }
    );
  }

  const existing = await prisma.relationship.findUnique({
    where: { id },
  });

  if (!existing) {
    return NextResponse.json({ error: "Relationship not found." }, { status: 404 });
  }

  if (existing.user1Id !== currentDbUserId && existing.user2Id !== currentDbUserId) {
    if (action === "approve" || action === "confirmCreator" || action === "reject" || action === "dispute") {
      logClaimDebug("relationships.patch.claim-action.forbidden-not-participant", {
        relationshipId: id,
        action,
        currentDbUserId,
      });
    }
    return NextResponse.json(
      { error: "You can only edit connections that include your own profile." },
      { status: 403 }
    );
  }

  const parsed = parseStoredRelationshipType(existing.type, existing.user1Id, existing.user2Id);
  const claimMeta = composeClaimMeta({
    storedType: existing.type,
    user1Id: existing.user1Id,
    user2Id: existing.user2Id,
    note: existing.note,
  });

  if (hasExpiredPendingConfirmation(claimMeta)) {
    const expiredMeta = {
      ...claimMeta,
      status: "expired" as const,
    };
    const expiredRelationship = await prisma.relationship.update({
      where: { id },
      data: {
        note: buildClaimMetaNote(expiredMeta),
      },
    });
    return NextResponse.json({
      error: "This claim expired because the original creator did not confirm it within 7 days.",
      relationship: normalizeRelationship(expiredRelationship),
    }, { status: 409 });
  }

  if (claimMeta.status === "pending_claim" || claimMeta.status === "pending_creator_confirmation") {
    if (action === "dispute") {
      const otherUserId =
        existing.user1Id === currentDbUserId ? existing.user2Id : existing.user1Id;
      const updated = await prisma.relationship.update({
        where: { id },
        data: {
          note: buildClaimMetaNote({
            ...claimMeta,
            status: "disputed",
            disputeReason: parsedPayload.data.note?.trim() || null,
          }),
        },
      });

      const reporter = await prisma.user.findUnique({
        where: { id: currentDbUserId },
        select: { name: true, handle: true },
      });

      await createModerationReport({
        kind: "private-node",
        targetId: existing.id,
        targetLabel: `Connection claim ${existing.id}`,
        reason: parsedPayload.data.note?.trim() || "Claim disputed",
        reporterUserId: currentDbUserId,
        reporterLabel: reporter?.name || reporter?.handle || null,
      });

      await sendNotification(
        currentDbUserId,
        otherUserId,
        "A connection claim was disputed and hidden pending moderator review.",
      );

      return NextResponse.json({ relationship: normalizeRelationship(updated) });
    }

    if (action === "reject") {
      const canReject =
        claimMeta.status === "pending_claim"
          ? currentDbUserId === claimMeta.creatorId || currentDbUserId === claimMeta.claimedByUserId
          : currentDbUserId === claimMeta.creatorId;

      if (!canReject) {
        return NextResponse.json(
          { error: "You cannot reject this claim in its current stage." },
          { status: 403 },
        );
      }

      const otherUserId =
        existing.user1Id === currentDbUserId ? existing.user2Id : existing.user1Id;
      const updated = await prisma.relationship.update({
        where: { id },
        data: {
          note: buildClaimMetaNote({
            ...claimMeta,
            status: "rejected",
          }),
        },
      });

      await sendNotification(
        currentDbUserId,
        otherUserId,
        "A connection claim was rejected and hidden.",
      );

      return NextResponse.json({ relationship: normalizeRelationship(updated) });
    }

    if (claimMeta.status === "pending_claim") {
      if (action !== "approve") {
        return NextResponse.json(
          { error: "Pending claims can only be approved, rejected, or disputed." },
          { status: 400 },
        );
      }

      if (currentDbUserId !== claimMeta.claimedByUserId) {
        return NextResponse.json(
          { error: "Only the claimed user can verify this claim." },
          { status: 403 },
        );
      }

      const claimConfirmedAt = new Date().toISOString();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      const updated = await prisma.relationship.update({
        where: { id },
        data: {
          note: buildClaimMetaNote({
            ...claimMeta,
            status: "pending_creator_confirmation",
            claimConfirmedAt,
            expiresAt,
          }),
        },
      });

      await sendNotification(
        currentDbUserId,
        claimMeta.creatorId,
        "A claimed connection is ready for your final confirmation.",
      );

      return NextResponse.json({ relationship: normalizeRelationship(updated) });
    }

    const shouldConfirm = action === "confirmCreator" || action === "approve";
    if (!shouldConfirm) {
      logClaimDebug("relationships.patch.pending-creator.invalid-action", {
        relationshipId: id,
        action,
        currentDbUserId,
        creatorId: claimMeta.creatorId,
      });
      return NextResponse.json(
        { error: "Waiting for the original creator to confirm, reject, or dispute this claim." },
        { status: 400 },
      );
    }

    if (currentDbUserId !== claimMeta.creatorId) {
      logClaimDebug("relationships.patch.pending-creator.forbidden", {
        relationshipId: id,
        action,
        currentDbUserId,
        creatorId: claimMeta.creatorId,
      });
      return NextResponse.json(
        { error: "Only the original creator can finalize this claim." },
        { status: 403 },
      );
    }

    const nextType = type || parsed.baseType;
    const updated = await prisma.relationship.update({
      where: { id },
      data: {
        type: nextType,
        note: "",
        isPublic: true,
      },
    });
    await recalculateConnectionScoresForUsers([
      existing.user1Id,
      existing.user2Id,
    ]);

    logClaimDebug("relationships.patch.pending-creator.confirmed", {
      relationshipId: id,
      action,
      actorNodeId: currentDbUserId,
      nextType,
      isPublic: true,
    });

    await sendNotification(
      currentDbUserId,
      claimMeta.claimedByUserId,
      `Your connection was confirmed and is now public as "${nextType}".`,
    );

    return NextResponse.json({ relationship: normalizeRelationship(updated) });
  }

  if (claimMeta.status === "rejected" || claimMeta.status === "expired" || claimMeta.status === "disputed") {
    return NextResponse.json(
      { error: "This connection is not active. Remove it to start over." },
      { status: 409 },
    );
  }

  if (action === "requestPublic") {
    if (existing.isPublic) {
      return NextResponse.json({ relationship: normalizeRelationship(existing) });
    }
    if (existing.publicRequestedBy === currentDbUserId) {
      return NextResponse.json({ relationship: normalizeRelationship(existing) });
    }

    const otherUserIdForPublic =
      existing.user1Id === currentDbUserId ? existing.user2Id : existing.user1Id;

    const updated = await prisma.relationship.update({
      where: { id },
      data: { publicRequestedBy: currentDbUserId },
    });

    await sendNotification(
      currentDbUserId,
      otherUserIdForPublic,
      `Someone wants to make your connection public. Review it on ${approvalInboxLink}.`
    );

    return NextResponse.json({ relationship: normalizeRelationship(updated) });
  }

  if (action === "approvePublic") {
    if (!existing.publicRequestedBy) {
      return NextResponse.json({ error: "No pending public request." }, { status: 400 });
    }
    if (existing.publicRequestedBy === currentDbUserId) {
      return NextResponse.json(
        { error: "You cannot approve your own public request." },
        { status: 403 }
      );
    }

    const requester = existing.publicRequestedBy;
    const updated = await prisma.relationship.update({
      where: { id },
      data: { isPublic: true, publicRequestedBy: null },
    });

    await sendNotification(
      currentDbUserId,
      requester,
      "Your connection is now public on the chart!"
    );

    return NextResponse.json({ relationship: normalizeRelationship(updated) });
  }

  if (action === "denyPublic") {
    if (!existing.publicRequestedBy) {
      return NextResponse.json({ error: "No pending public request." }, { status: 400 });
    }

    const requester = existing.publicRequestedBy;
    const updated = await prisma.relationship.update({
      where: { id },
      data: { publicRequestedBy: null },
    });

    await sendNotification(
      currentDbUserId,
      requester,
      "Your request to make a connection public was declined."
    );

    return NextResponse.json({ relationship: normalizeRelationship(updated) });
  }

  if (action) {
    return NextResponse.json(
      { error: "This connection is already approved." },
      { status: 400 }
    );
  }

  if (!type) {
    return NextResponse.json(
      { error: "Choose a connection type to request a change." },
      { status: 400 }
    );
  }

  if (type === parsed.baseType) {
    return NextResponse.json({ relationship: normalizeRelationship(existing) });
  }

  const otherUserId =
    existing.user1Id === currentDbUserId ? existing.user2Id : existing.user1Id;

  const nextType = type || parsed.baseType;

  try {
    const updated = await prisma.relationship.update({
      where: { id },
      data: {
        type: encodePendingType(nextType, currentDbUserId, otherUserId),
      },
    });

    await sendNotification(
      currentDbUserId,
      otherUserId,
      `You have a request to change this connection to "${nextType}". Review it on ${approvalInboxLink}.`
    );

    return NextResponse.json({ relationship: normalizeRelationship(updated) });
  } catch (error) {
    console.error("Failed to update relationship", error);
    return NextResponse.json({ error: "Failed to update relationship." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const authResult = await getAuthenticatedDbUserId(request);
  if (authResult.error) {
    return authResult.error;
  }

  const currentDbUserId = authResult.dbUserId;
  const lockMessage = await getActiveUserLockMessage(currentDbUserId);
  if (lockMessage) {
    return NextResponse.json({ error: lockMessage }, { status: 403 });
  }

  const ip = getRequestIp(request);
  const rateLimit = await checkRateLimit(`relationships-delete:${currentDbUserId}:${ip}`, {
    windowMs: 5 * 60 * 1000,
    maxRequests: 40,
  });

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many delete requests. Please try again shortly." },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateLimit.retryAfterSeconds),
        },
      }
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsedPayload = deleteRelationshipSchema.safeParse(payload);
  if (!parsedPayload.success) {
    return NextResponse.json({ error: "Invalid relationship payload." }, { status: 400 });
  }

  const { id, actorNodeId } = parsedPayload.data;

  if (!actorNodeId || actorNodeId !== currentDbUserId) {
    return NextResponse.json(
      { error: "You can only delete connections from your own node." },
      { status: 403 }
    );
  }

  const existing = await prisma.relationship.findUnique({
    where: { id },
  });

  if (!existing) {
    return NextResponse.json({ error: "Relationship not found." }, { status: 404 });
  }

  if (existing.user1Id !== currentDbUserId && existing.user2Id !== currentDbUserId) {
    return NextResponse.json(
      { error: "You can only delete connections that include your own profile." },
      { status: 403 }
    );
  }

  const otherUserId =
    existing.user1Id === currentDbUserId ? existing.user2Id : existing.user1Id;

  try {
    await prisma.relationship.delete({ where: { id } });
    await recalculateConnectionScoresForUsers([
      existing.user1Id,
      existing.user2Id,
    ]);

    await sendNotification(
      currentDbUserId,
      otherUserId,
      "A connection was removed."
    );

    return NextResponse.json({ deleted: true, id });
  } catch (error) {
    console.error("Failed to delete relationship", error);
    return NextResponse.json({ error: "Failed to delete relationship." }, { status: 500 });
  }
}
