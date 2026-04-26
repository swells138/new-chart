import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { claimPlaceholderForUser } from "@/lib/network-claims";

const hasClerkKeys =
  Boolean(process.env.CLERK_SECRET_KEY) &&
  Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

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

// ───────────────────────────────────────────────
// GET — validate invite token and return preview info (safe, no auth required)
// ───────────────────────────────────────────────
export async function GET(_request: Request, context: RouteContext) {
  const { token } = await context.params;

  if (!token || typeof token !== "string" || token.length > 200) {
    return NextResponse.json({ error: "Invalid token." }, { status: 400 });
  }

  const placeholder = await prisma.placeholderPerson.findUnique({
    where: { inviteToken: token },
    include: {
      owner: { select: { id: true, name: true, handle: true } },
    },
  });

  if (!placeholder) {
    return NextResponse.json({ error: "This invite link is invalid or has expired." }, { status: 404 });
  }

  if (placeholder.claimStatus === "claimed") {
    return NextResponse.json({ error: "This invite has already been accepted." }, { status: 410 });
  }

  if (placeholder.claimStatus === "denied") {
    return NextResponse.json({ error: "This invite is no longer active." }, { status: 410 });
  }

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

  if (!token || typeof token !== "string" || token.length > 200) {
    return NextResponse.json({ error: "Invalid token." }, { status: 400 });
  }

  if (!hasClerkKeys) {
    return NextResponse.json({ error: "Auth is not configured." }, { status: 503 });
  }

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "You must be signed in to accept an invite." }, { status: 401 });
  }

  const clerk = await currentUser();
  const hasVerifiedEmail = clerk?.emailAddresses.some(
    (emailAddress) => emailAddress.verification?.status === "verified"
  );
  if (!hasVerifiedEmail) {
    return NextResponse.json(
      { error: "Verify your email before claiming this connection invite." },
      { status: 403 }
    );
  }

  let action: string;
  try {
    const body = (await request.json()) as { action?: string };
    action = typeof body.action === "string" ? body.action : "";
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (action !== "approve" && action !== "deny") {
    return NextResponse.json({ error: "action must be 'approve' or 'deny'." }, { status: 400 });
  }

  const claimerDbId = await getOrCreateCurrentDbUserId(userId);

  const placeholder = await prisma.placeholderPerson.findUnique({
    where: { inviteToken: token },
  });

  if (!placeholder) {
    return NextResponse.json({ error: "This invite link is invalid or has expired." }, { status: 404 });
  }

  if (placeholder.claimStatus === "claimed") {
    return NextResponse.json({ error: "This invite has already been accepted." }, { status: 410 });
  }

  if (placeholder.claimStatus === "denied") {
    return NextResponse.json({ error: "This invite is no longer active." }, { status: 410 });
  }

  // Prevent someone from claiming their own invite
  if (placeholder.ownerId === claimerDbId) {
    return NextResponse.json({ error: "You cannot claim your own invite." }, { status: 400 });
  }

  if (action === "deny") {
    await prisma.placeholderPerson.update({
      where: { id: placeholder.id },
      data: { claimStatus: "denied", linkedUserId: claimerDbId },
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
  return NextResponse.json(
    {
      result: "claimed",
      relationship: result.pendingRelationshipId
        ? { id: result.pendingRelationshipId }
        : undefined,
      alreadyConnected: result.alreadyConnected,
    },
    { status: result.pendingRelationshipId ? 201 : 200 }
  );
}
