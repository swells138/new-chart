import { auth, currentUser } from "@clerk/nextjs/server";
import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { claimPlaceholderForUser } from "@/lib/network-claims";

const hasClerkKeys =
  Boolean(process.env.CLERK_SECRET_KEY) &&
  Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ||
    process.env.CLERK_PUBLISHABLE_KEY,
  );

const claimDebugEnabled =
  process.env.DEBUG_CLAIMS === "1" || process.env.NODE_ENV !== "production";

const inviteExpiresMs = 30 * 24 * 60 * 60 * 1000;

function logClaimDebug(event: string, details?: Record<string, unknown>) {
  if (!claimDebugEnabled) {
    return;
  }

  console.info("[claim-debug]", event, details ?? {});
}

function hashInviteToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

async function getInviteAudit(token: string) {
  const rows = await prisma.$queryRaw<
    Array<{ id: string; status: string; sentAt: Date | null; createdAt: Date }>
  >`
    SELECT "id", "status", "sentAt", "createdAt"
    FROM "NodeInvite"
    WHERE "tokenHash" = ${hashInviteToken(token)}
    ORDER BY "createdAt" DESC
    LIMIT 1
  `;

  return rows[0] ?? null;
}

async function expireInvite(inviteId: string) {
  await prisma.$executeRaw`
    UPDATE "NodeInvite"
    SET "status" = 'expired',
        "expiredAt" = ${new Date()},
        "updatedAt" = ${new Date()}
    WHERE "id" = ${inviteId}
  `;
}

async function markInviteAccepted(token: string) {
  await prisma.$executeRaw`
    UPDATE "NodeInvite"
    SET "status" = 'accepted',
        "acceptedAt" = ${new Date()},
        "updatedAt" = ${new Date()}
    WHERE "tokenHash" = ${hashInviteToken(token)}
      AND "status" = 'pending'
  `;
}

interface RouteContext {
  params: Promise<{ token: string }>;
}

async function getOrCreateCurrentDbUserId(clerkId: string) {
  const existing = await prisma.user.findUnique({
    where: { clerkId },
    select: { id: true },
  });
  if (existing) return existing.id;

  const clerk = await currentUser();
  const fullName = [clerk?.firstName, clerk?.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();

  try {
    const created = await prisma.user.create({
      data: { clerkId, name: fullName || clerk?.username || "New member" },
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
      if (retry) return retry.id;
    }
    throw error;
  }
}

// ───────────────────────────────────────────────
// GET — validate invite token and return preview info (safe, no auth required)
// ───────────────────────────────────────────────
export async function GET(_request: Request, context: RouteContext) {
  const { token } = await context.params;
  logClaimDebug("invite.get.start", { tokenLength: token?.length ?? 0 });

  if (!token || typeof token !== "string" || token.length > 200) {
    logClaimDebug("invite.get.invalid-token");
    return NextResponse.json({ error: "Invalid token." }, { status: 400 });
  }

  const placeholder = await prisma.placeholderPerson.findUnique({
    where: { inviteToken: token },
    include: {
      owner: { select: { id: true, name: true, handle: true } },
    },
  });

  if (!placeholder) {
    logClaimDebug("invite.get.not-found", { tokenLength: token.length });
    return NextResponse.json(
      { error: "This invite link is invalid or has expired." },
      { status: 404 },
    );
  }

  const inviteAudit = await getInviteAudit(token);
  const inviteCreatedAt = inviteAudit?.sentAt ?? inviteAudit?.createdAt;
  if (
    inviteAudit?.status === "expired" ||
    (inviteCreatedAt &&
      Date.now() - inviteCreatedAt.getTime() > inviteExpiresMs)
  ) {
    if (inviteAudit.status !== "expired") {
      await expireInvite(inviteAudit.id);
    }
    logClaimDebug("invite.get.expired", { placeholderId: placeholder.id });
    return NextResponse.json(
      { error: "This invite link is invalid or has expired." },
      { status: 410 },
    );
  }

  if (placeholder.claimStatus === "claimed") {
    logClaimDebug("invite.get.already-claimed", {
      placeholderId: placeholder.id,
    });
    return NextResponse.json(
      { error: "This invite has already been accepted." },
      { status: 410 },
    );
  }

  if (placeholder.claimStatus === "denied") {
    logClaimDebug("invite.get.denied", { placeholderId: placeholder.id });
    return NextResponse.json(
      { error: "This invite is no longer active." },
      { status: 410 },
    );
  }

  logClaimDebug("invite.get.success", {
    placeholderId: placeholder.id,
    ownerId: placeholder.ownerId,
    claimStatus: placeholder.claimStatus,
  });

  // Return only the information the invitee needs to make a decision
  return NextResponse.json({
    invite: {
      placeholderId: placeholder.id,
      ownerName: placeholder.owner.name ?? "Someone",
      ownerHandle: placeholder.owner.handle,
      relationshipType: placeholder.relationshipType,
      note: placeholder.note,
      claimStatus: placeholder.claimStatus,
    },
  });
}

// ───────────────────────────────────────────────
// POST — claim an invite (approve or deny)
// ───────────────────────────────────────────────
export async function POST(request: Request, context: RouteContext) {
  const { token } = await context.params;
  logClaimDebug("invite.post.start", { tokenLength: token?.length ?? 0 });

  if (!token || typeof token !== "string" || token.length > 200) {
    logClaimDebug("invite.post.invalid-token");
    return NextResponse.json({ error: "Invalid token." }, { status: 400 });
  }

  if (!hasClerkKeys) {
    logClaimDebug("invite.post.auth-config-missing");
    return NextResponse.json(
      { error: "Auth is not configured." },
      { status: 503 },
    );
  }

  const { userId } = await auth();
  if (!userId) {
    logClaimDebug("invite.post.unauthorized");
    return NextResponse.json(
      { error: "You must be signed in to accept an invite." },
      { status: 401 },
    );
  }

  const clerk = await currentUser();
  const hasVerifiedEmail = clerk?.emailAddresses.some(
    (emailAddress) => emailAddress.verification?.status === "verified",
  );
  if (!hasVerifiedEmail) {
    logClaimDebug("invite.post.unverified-email", { clerkUserId: userId });
    return NextResponse.json(
      { error: "Verify your email before claiming this connection invite." },
      { status: 403 },
    );
  }

  let action: string;
  try {
    const body = (await request.json()) as { action?: string };
    action = typeof body.action === "string" ? body.action : "";
  } catch {
    logClaimDebug("invite.post.invalid-json", { clerkUserId: userId });
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (action !== "approve" && action !== "deny") {
    logClaimDebug("invite.post.invalid-action", {
      clerkUserId: userId,
      action,
    });
    return NextResponse.json(
      { error: "action must be 'approve' or 'deny'." },
      { status: 400 },
    );
  }

  const claimerDbId = await getOrCreateCurrentDbUserId(userId);

  const placeholder = await prisma.placeholderPerson.findUnique({
    where: { inviteToken: token },
  });

  if (!placeholder) {
    logClaimDebug("invite.post.not-found", { dbUserId: claimerDbId });
    return NextResponse.json(
      { error: "This invite link is invalid or has expired." },
      { status: 404 },
    );
  }

  const inviteAudit = await getInviteAudit(token);
  const inviteCreatedAt = inviteAudit?.sentAt ?? inviteAudit?.createdAt;
  if (
    inviteAudit?.status === "expired" ||
    (inviteCreatedAt &&
      Date.now() - inviteCreatedAt.getTime() > inviteExpiresMs)
  ) {
    if (inviteAudit.status !== "expired") {
      await expireInvite(inviteAudit.id);
    }
    logClaimDebug("invite.post.expired", {
      placeholderId: placeholder.id,
      dbUserId: claimerDbId,
    });
    return NextResponse.json(
      { error: "This invite link is invalid or has expired." },
      { status: 410 },
    );
  }

  if (placeholder.claimStatus === "claimed") {
    logClaimDebug("invite.post.already-claimed", {
      placeholderId: placeholder.id,
      dbUserId: claimerDbId,
    });
    return NextResponse.json(
      { error: "This invite has already been accepted." },
      { status: 410 },
    );
  }

  if (placeholder.claimStatus === "denied") {
    logClaimDebug("invite.post.denied", {
      placeholderId: placeholder.id,
      dbUserId: claimerDbId,
    });
    return NextResponse.json(
      { error: "This invite is no longer active." },
      { status: 410 },
    );
  }

  // Prevent someone from claiming their own invite
  if (placeholder.ownerId === claimerDbId) {
    logClaimDebug("invite.post.self-claim-blocked", {
      placeholderId: placeholder.id,
      dbUserId: claimerDbId,
    });
    return NextResponse.json(
      { error: "You cannot claim your own invite." },
      { status: 400 },
    );
  }

  if (action === "deny") {
    await prisma.placeholderPerson.update({
      where: { id: placeholder.id },
      data: { claimStatus: "denied", linkedUserId: claimerDbId },
    });
    if (inviteAudit) {
      await expireInvite(inviteAudit.id);
    }

    logClaimDebug("invite.post.denied-success", {
      placeholderId: placeholder.id,
      dbUserId: claimerDbId,
    });

    // Notify the owner
    try {
      await prisma.message.create({
        data: {
          senderId: claimerDbId,
          recipientId: placeholder.ownerId,
          content: `Someone declined your connection invite (${placeholder.relationshipType}).`,
        },
      });
    } catch {
      // Notification failure is non-fatal
    }

    return NextResponse.json({ result: "denied" });
  }

  // action === "approve"
  const result = await claimPlaceholderForUser(claimerDbId, placeholder.id);
  await markInviteAccepted(token);
  logClaimDebug("invite.post.approved-success", {
    placeholderId: placeholder.id,
    dbUserId: claimerDbId,
    relationshipId: result.relationshipId ?? null,
    alreadyConnected: result.alreadyConnected,
  });
  return NextResponse.json(
    {
      result: "claimed",
      relationship: result.relationshipId
        ? { id: result.relationshipId }
        : undefined,
      alreadyConnected: result.alreadyConnected,
    },
    { status: result.relationshipId ? 201 : 200 },
  );
}
