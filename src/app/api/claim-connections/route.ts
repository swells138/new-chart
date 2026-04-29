import { NextResponse } from "next/server";
import { z } from "zod";
import { clerkClient, currentUser } from "@clerk/nextjs/server";
import {
  claimPlaceholderForUser,
  dismissClaimCandidate,
  getClaimCandidateDiagnosticsForUser,
  getClaimCandidatesForUser,
  getPendingCreatorConfirmations,
} from "@/lib/network-claims";
import { resolveClerkUserId } from "@/lib/clerk-auth";
import { ensureDbUserIdByClerkId } from "@/lib/db-user-bootstrap";
import { prisma } from "@/lib/prisma";

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

const actionSchema = z
  .object({
    action: z.enum(["claim", "dismiss"]),
    placeholderId: z.string().trim().min(1).max(100),
  })
  .strict();

function getClerkNameCandidates(
  clerkUser: Awaited<ReturnType<typeof currentUser>>,
) {
  if (!clerkUser) {
    return [];
  }

  return [
    [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" "),
    clerkUser.fullName,
    clerkUser.username,
    clerkUser.firstName,
    clerkUser.lastName,
  ].filter((name): name is string => Boolean(name?.trim()));
}

async function getAuthenticatedDbUserId(request: Request) {
  if (!hasClerkKeys) {
    return { error: NextResponse.json({ error: "Auth is not configured." }, { status: 503 }) };
  }

  const userId = await resolveClerkUserId(request);
  if (!userId) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  let clerkUser = await currentUser();

  if (!clerkUser || clerkUser.id !== userId) {
    try {
      const client = await clerkClient();
      clerkUser = await client.users.getUser(userId);
    } catch {
      clerkUser = null;
    }
  }

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
    getClerkNameCandidates(clerkUser)[0] ||
    clerkUser?.username ||
    clerkUser?.firstName ||
    "New member";

  return {
    dbUserId: await ensureDbUserIdByClerkId(
      userId,
      fullName,
      clerkUser?.imageUrl,
    ),
    nameCandidates: getClerkNameCandidates(clerkUser),
  };
}

export async function GET(request: Request) {
  logClaimDebug("claim-connections.get.start", {
    url: request.url,
  });

  const authResult = await getAuthenticatedDbUserId(request);
  if (authResult.error) {
    logClaimDebug("claim-connections.get.auth-failed");
    return authResult.error;
  }

  const searchParams = new URL(request.url).searchParams;
  const includeDismissed = searchParams.get("includeDismissed") === "1";
  const candidates = await getClaimCandidatesForUser(authResult.dbUserId, {
    alternateNames: authResult.nameCandidates,
    includeDismissed,
    limit: includeDismissed ? 5 : 5,
  });
  const diagnostics =
    searchParams.get("debug") === "1"
      ? await getClaimCandidateDiagnosticsForUser(authResult.dbUserId, {
          alternateNames: authResult.nameCandidates,
        })
      : null;
  const pendingConfirmations =
    searchParams.get("debug") === "1"
      ? await getPendingCreatorConfirmations(authResult.dbUserId)
      : null;

  logClaimDebug("claim-connections.get.success", {
    dbUserId: authResult.dbUserId,
    includeDismissed,
    candidateCount: candidates.length,
  });

  return NextResponse.json({
    candidates,
    ...(diagnostics ? { diagnostics } : {}),
    ...(pendingConfirmations ? { pendingConfirmations } : {}),
  });
}

export async function POST(request: Request) {
  logClaimDebug("claim-connections.post.start", {
    url: request.url,
  });

  const authResult = await getAuthenticatedDbUserId(request);
  if (authResult.error) {
    logClaimDebug("claim-connections.post.auth-failed");
    return authResult.error;
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    logClaimDebug("claim-connections.post.invalid-json", {
      dbUserId: authResult.dbUserId,
    });
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = actionSchema.safeParse(payload);
  if (!parsed.success) {
    logClaimDebug("claim-connections.post.invalid-payload", {
      dbUserId: authResult.dbUserId,
    });
    return NextResponse.json({ error: "Invalid claim payload." }, { status: 400 });
  }

  try {
    if (parsed.data.action === "dismiss") {
      await dismissClaimCandidate(authResult.dbUserId, parsed.data.placeholderId);
      logClaimDebug("claim-connections.post.dismissed", {
        dbUserId: authResult.dbUserId,
        placeholderId: parsed.data.placeholderId,
      });
      return NextResponse.json({ dismissed: true, placeholderId: parsed.data.placeholderId });
    }

    const result = await claimPlaceholderForUser(authResult.dbUserId, parsed.data.placeholderId);
    let persistedPlaceholder = await prisma.placeholderPerson.findUnique({
      where: { id: parsed.data.placeholderId },
      select: {
        id: true,
        linkedUserId: true,
        claimStatus: true,
      },
    });

    if (
      !persistedPlaceholder ||
      persistedPlaceholder.linkedUserId !== authResult.dbUserId ||
      persistedPlaceholder.claimStatus !== "claimed"
    ) {
      logClaimDebug("claim-connections.post.repair-placeholder", {
        dbUserId: authResult.dbUserId,
        placeholderId: parsed.data.placeholderId,
        beforeRepair: persistedPlaceholder,
      });

      await prisma.placeholderPerson.updateMany({
        where: {
          id: parsed.data.placeholderId,
          OR: [
            { linkedUserId: null },
            { linkedUserId: authResult.dbUserId },
          ],
        },
        data: {
          linkedUserId: authResult.dbUserId,
          claimStatus: "claimed",
          inviteToken: null,
        },
      });

      persistedPlaceholder = await prisma.placeholderPerson.findUnique({
        where: { id: parsed.data.placeholderId },
        select: {
          id: true,
          linkedUserId: true,
          claimStatus: true,
        },
      });
    }

    const candidates = await getClaimCandidatesForUser(authResult.dbUserId, {
      alternateNames: authResult.nameCandidates,
      includeDismissed: false,
      limit: 5,
    });
    const stillSuggested = candidates.some(
      (candidate) => candidate.placeholderId === parsed.data.placeholderId
    );
    const persistedClaim =
      persistedPlaceholder?.linkedUserId === authResult.dbUserId &&
      persistedPlaceholder.claimStatus === "claimed";
    const visibleCandidates = candidates.filter(
      (candidate) => candidate.placeholderId !== parsed.data.placeholderId
    );

    logClaimDebug("claim-connections.post.claimed", {
      dbUserId: authResult.dbUserId,
      placeholderId: parsed.data.placeholderId,
      relationshipId: result.relationshipId ?? null,
      alreadyConnected: result.alreadyConnected,
      persistedPlaceholder,
      stillSuggested,
    });

    if (!persistedClaim) {
      return NextResponse.json(
        {
          error:
            `The claim did not persist. Saved status: ${persistedPlaceholder?.claimStatus ?? "missing"}, linked user: ${persistedPlaceholder?.linkedUserId ?? "missing"}.`,
          claimed: true,
          result,
          persistedPlaceholder,
          candidates,
        },
        { status: 409 }
      );
    }

    return NextResponse.json({
      claimed: true,
      result,
      persistedPlaceholder,
      candidates: visibleCandidates,
      warning: stillSuggested ? "Claim persisted, but candidate refresh echoed the claimed id." : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update this claim.";
    logClaimDebug("claim-connections.post.failed", {
      dbUserId: authResult.dbUserId,
      error: message,
    });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
