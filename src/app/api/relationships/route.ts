import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, getRequestIp } from "@/lib/rate-limit";
import type { RelationshipType } from "@/types/models";
import { resolveClerkUserId } from "@/lib/clerk-auth";

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
      .enum(["approve", "reject", "requestPublic", "approvePublic", "denyPublic"])
      .optional(),
    actorNodeId: z.string().trim().min(1).max(100),
    note: z.string().max(500).optional(),
  })
  .strict();

type ApprovalStatus = "approved" | "pending";

const metaPrefix = "[[meta:";
const metaSuffix = "]]";
const pendingTypePrefix = "pending::";
const approvalInboxLink = "/map?chart=public&focus=approvals#pending-verification";

interface RelationshipMeta {
  status: ApprovalStatus;
  requesterId: string;
  responderId: string;
}

function encodePendingType(baseType: RelationshipType, requesterId: string, responderId: string) {
  return `${pendingTypePrefix}${baseType}::${requesterId}::${responderId}`;
}

function parseStoredRelationshipType(
  storedType: string,
  fallbackRequesterId: string,
  fallbackResponderId: string
): {
  status: ApprovalStatus;
  baseType: RelationshipType;
  requesterId: string;
  responderId: string;
} {
  if (!storedType.startsWith(pendingTypePrefix)) {
    return {
      status: "approved",
      baseType: relationshipTypes.includes(storedType as RelationshipType)
        ? (storedType as RelationshipType)
        : "Friends",
      requesterId: fallbackRequesterId,
      responderId: fallbackResponderId,
    };
  }

  const [, rawBaseType = "Friends", requesterId = fallbackRequesterId, responderId = fallbackResponderId] =
    storedType.split("::");

  return {
    status: "pending",
    baseType: relationshipTypes.includes(rawBaseType as RelationshipType)
      ? (rawBaseType as RelationshipType)
      : "Friends",
    requesterId,
    responderId,
  };
}

function buildRelationshipMetaNote(meta: RelationshipMeta) {
  return `${metaPrefix}${JSON.stringify(meta)}${metaSuffix}`;
}

function normalizeRelationship(relationship: {
  id: string;
  user1Id: string;
  user2Id: string;
  type: string;
  isPublic?: boolean;
  publicRequestedBy?: string | null;
}) {
  const parsed = parseStoredRelationshipType(
    relationship.type,
    relationship.user1Id,
    relationship.user2Id
  );

  return {
    id: relationship.id,
    source: relationship.user1Id,
    target: relationship.user2Id,
    type: parsed.baseType,
    isPublic: relationship.isPublic ?? false,
    publicRequestedBy: relationship.publicRequestedBy ?? null,
    note:
      parsed.status === "pending"
        ? buildRelationshipMetaNote({
            status: "pending",
            requesterId: parsed.requesterId,
            responderId: parsed.responderId,
          })
        : "",
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
  const existing = await prisma.user.findUnique({
    where: { clerkId },
    select: { id: true },
  });

  if (existing) {
    return existing.id;
  }

  try {
    const created = await prisma.user.create({
      data: {
        clerkId,
        name: "New member",
      },
      select: { id: true },
    });

    return created.id;
  } catch (error) {
    const prismaError = error as { code?: string };

    if (prismaError.code === "P2002") {
      const retry = await prisma.user.findUnique({
        where: { clerkId },
        select: { id: true },
      });

      if (retry) {
        return retry.id;
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

export async function POST(request: Request) {
  const authResult = await getAuthenticatedDbUserId(request);
  if (authResult.error) {
    return authResult.error;
  }

  const currentDbUserId = authResult.dbUserId;
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
      },
    });

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
    return NextResponse.json(
      { error: "You can only edit connections that include your own profile." },
      { status: 403 }
    );
  }

  const parsed = parseStoredRelationshipType(existing.type, existing.user1Id, existing.user2Id);
  const meta: RelationshipMeta = {
    status: parsed.status,
    requesterId: parsed.requesterId,
    responderId: parsed.responderId,
  };

  if (meta.status === "pending") {
    if (action === "approve") {
      if (currentDbUserId !== meta.responderId) {
        return NextResponse.json(
          { error: "Only the invited user can approve this connection." },
          { status: 403 }
        );
      }

      const nextType = type || parsed.baseType;

      try {
        const updated = await prisma.relationship.update({
          where: { id },
          data: {
            type: nextType,
          },
        });

        await sendNotification(
          currentDbUserId,
          meta.requesterId,
          `Your connection request was approved as "${nextType}".`
        );

        return NextResponse.json({ relationship: normalizeRelationship(updated) });
      } catch (error) {
        console.error("Failed to approve relationship", error);
        return NextResponse.json({ error: "Failed to approve relationship." }, { status: 500 });
      }
    }

    if (action === "reject") {
      if (currentDbUserId !== meta.responderId && currentDbUserId !== meta.requesterId) {
        return NextResponse.json(
          { error: "You cannot decline this connection request." },
          { status: 403 }
        );
      }

      await prisma.relationship.delete({ where: { id } });

      const notifyUserId =
        currentDbUserId === meta.requesterId ? meta.responderId : meta.requesterId;
      const notifyContent =
        currentDbUserId === meta.requesterId
          ? "A connection request you sent was cancelled."
          : "A connection request was declined.";
      await sendNotification(currentDbUserId, notifyUserId, notifyContent);

      return NextResponse.json({ deleted: true, id });
    }

    return NextResponse.json(
      { error: "Pending connections must be approved or declined." },
      { status: 400 }
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