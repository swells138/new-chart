import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@clerk/nextjs/server";
import { claimPlaceholderForUser, dismissClaimCandidate, getClaimCandidatesForUser } from "@/lib/network-claims";
import { resolveClerkUserId } from "@/lib/clerk-auth";
import { ensureDbUserIdByClerkId } from "@/lib/db-user-bootstrap";

const hasClerkKeys =
  Boolean(process.env.CLERK_SECRET_KEY) &&
  Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ||
      process.env.CLERK_PUBLISHABLE_KEY
  );

const actionSchema = z
  .object({
    action: z.enum(["claim", "dismiss"]),
    placeholderId: z.string().trim().min(1).max(100),
  })
  .strict();

async function getAuthenticatedDbUserId(request: Request) {
  if (!hasClerkKeys) {
    return { error: NextResponse.json({ error: "Auth is not configured." }, { status: 503 }) };
  }

  const userId = await resolveClerkUserId(request);
  if (!userId) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  // Get the user's actual name from Clerk
  const clerkUser = await currentUser();
  const hasVerifiedEmail = clerkUser?.emailAddresses.some(
    (emailAddress) => emailAddress.verification?.status === "verified"
  );
  if (!hasVerifiedEmail) {
    return {
      error: NextResponse.json(
        { error: "Verify your email before claiming a connection." },
        { status: 403 }
      ),
    };
  }

  const fullName =
    clerkUser?.firstName && clerkUser?.lastName
      ? `${clerkUser.firstName} ${clerkUser.lastName}`
      : clerkUser?.username ||
        clerkUser?.firstName ||
        "New member";

  return { dbUserId: await ensureDbUserIdByClerkId(userId, fullName) };
}

export async function GET(request: Request) {
  const authResult = await getAuthenticatedDbUserId(request);
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
  const authResult = await getAuthenticatedDbUserId(request);
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