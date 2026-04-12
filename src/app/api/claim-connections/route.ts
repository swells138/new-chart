import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { claimPlaceholderForUser, dismissClaimCandidate, getClaimCandidatesForUser } from "@/lib/network-claims";
import { prisma } from "@/lib/prisma";

const hasClerkKeys =
  Boolean(process.env.CLERK_SECRET_KEY) &&
  Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

const actionSchema = z
  .object({
    action: z.enum(["claim", "dismiss"]),
    placeholderId: z.string().trim().min(1).max(100),
  })
  .strict();

async function getOrCreateCurrentDbUserId(clerkId: string) {
  const existing = await prisma.user.findUnique({
    where: { clerkId },
    select: { id: true },
  });

  if (existing) {
    return existing.id;
  }

  const clerk = await currentUser();
  const fullName = [clerk?.firstName, clerk?.lastName].filter(Boolean).join(" ").trim();
  const email = clerk?.emailAddresses?.[0]?.emailAddress;
  const phoneNumber = clerk?.phoneNumbers?.[0]?.phoneNumber;

  try {
    const created = await prisma.user.create({
      data: {
        clerkId,
        name: fullName || clerk?.username || "New member",
        email,
        phoneNumber,
        handle: clerk?.username || null,
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

async function getAuthenticatedDbUserId() {
  if (!hasClerkKeys) {
    return { error: NextResponse.json({ error: "Auth is not configured." }, { status: 503 }) };
  }

  const { userId } = await auth();
  if (!userId) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  return { dbUserId: await getOrCreateCurrentDbUserId(userId) };
}

export async function GET(request: Request) {
  const authResult = await getAuthenticatedDbUserId();
  if (authResult.error) {
    return authResult.error;
  }

  const includeDismissed = new URL(request.url).searchParams.get("includeDismissed") === "1";
  const candidates = await getClaimCandidatesForUser(authResult.dbUserId, {
    includeDismissed,
    limit: includeDismissed ? 5 : 5,
  });

  return NextResponse.json({ candidates });
}

export async function POST(request: Request) {
  const authResult = await getAuthenticatedDbUserId();
  if (authResult.error) {
    return authResult.error;
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = actionSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid claim payload." }, { status: 400 });
  }

  try {
    if (parsed.data.action === "dismiss") {
      await dismissClaimCandidate(authResult.dbUserId, parsed.data.placeholderId);
      return NextResponse.json({ dismissed: true, placeholderId: parsed.data.placeholderId });
    }

    const result = await claimPlaceholderForUser(authResult.dbUserId, parsed.data.placeholderId);
    return NextResponse.json({ claimed: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update this claim.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}