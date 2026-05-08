import { auth, currentUser } from "@clerk/nextjs/server";
import { cookies, headers } from "next/headers";
import { RelationshipMap } from "@/components/map/relationship-map";
import { ClaimConnectionsPanel } from "@/components/profile/claim-connections-panel";
import { getClaimCandidatesForUser } from "@/lib/network-claims";
import { ensureDbUserByClerkId } from "@/lib/db-user-bootstrap";
import { getEffectiveIsPro } from "@/lib/pro-user";
import { getAllRelationships, getAllUsers, getPrivateConnectionsByUser, getRelationshipsByUser } from "@/lib/prisma-queries";

export const dynamic = "force-dynamic";

const hasClerkKeys =
  Boolean(process.env.CLERK_SECRET_KEY) &&
  Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ||
      process.env.CLERK_PUBLISHABLE_KEY
  );

function normalizeOrigin(input: string | null | undefined) {
  if (!input) {
    return null;
  }

  const origin = input.startsWith("http") ? input : `https://${input}`;
  return origin.replace(/\/$/, "");
}

function getRequestOrigin(headersList: Awaited<ReturnType<typeof headers>>) {
  const host = headersList.get("x-forwarded-host") ?? headersList.get("host");
  if (!host) {
    return null;
  }

  const protocol = headersList.get("x-forwarded-proto") ?? "https";
  return `${protocol}://${host}`.replace(/\/$/, "");
}

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

function getClerkPrimaryEmail(
  clerkUser: Awaited<ReturnType<typeof currentUser>>,
) {
  const primaryEmailId = clerkUser?.primaryEmailAddressId;
  const primaryEmail = clerkUser?.emailAddresses.find(
    (email) => email.id === primaryEmailId,
  )?.emailAddress;

  return primaryEmail ?? clerkUser?.emailAddresses[0]?.emailAddress ?? null;
}

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

export default async function MapPage({
  searchParams,
}: {
  searchParams?: Promise<{ targetUserId?: string | string[] }>;
}) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const targetUserIdParam = resolvedSearchParams.targetUserId;
  const targetUserId = Array.isArray(targetUserIdParam)
    ? targetUserIdParam[0]
    : targetUserIdParam;
  let currentUserDbId: string | null = null;
  let currentUserIsPro = false;
  let clerkNameCandidates: string[] = [];
  const cookieStore = await cookies();
  const headersList = await headers();
  const hasSessionCookie = cookieStore.has("__session");
  let sessionSignedIn = hasSessionCookie;

  if (hasClerkKeys) {
    try {
      const userId = await resolveClerkUserId();
      sessionSignedIn = Boolean(userId) || hasSessionCookie;

      if (userId) {
        const clerk = await currentUser();
        clerkNameCandidates = getClerkNameCandidates(clerk);
        const fullName = [clerk?.firstName, clerk?.lastName].filter(Boolean).join(" ").trim();
        const profileImage = clerk?.imageUrl || null;
        const user = await ensureDbUserByClerkId(
          userId,
          fullName || clerk?.username || "New member",
          profileImage,
          getClerkPrimaryEmail(clerk),
        );

        currentUserDbId = user.id;
        currentUserIsPro = getEffectiveIsPro(user);
      }
    } catch (error) {
      console.error("Map page failed to initialize authenticated user", error);
      currentUserDbId = null;
      sessionSignedIn = hasSessionCookie;
    }
  }

  let allUsers: Awaited<ReturnType<typeof getAllUsers>> = [];
  let relationships: Awaited<ReturnType<typeof getAllRelationships>> = [];

  try {
    [allUsers, relationships] = await Promise.all([getAllUsers(), getAllRelationships()]);
  } catch (error) {
    console.error("Map page failed to load base network data", error);
  }

  const users = allUsers;
  let userConnections: typeof relationships = [];
  let privatePlaceholders = [] as Awaited<ReturnType<typeof getPrivateConnectionsByUser>>;
  let claimCandidates: Awaited<ReturnType<typeof getClaimCandidatesForUser>> = [];

  if (currentUserDbId) {
    try {
      [userConnections, privatePlaceholders] = await Promise.all([
        getRelationshipsByUser(currentUserDbId),
        getPrivateConnectionsByUser(currentUserDbId),
      ]);
    } catch (error) {
      console.error("Map page failed to load user-scoped network data", error);
      userConnections = [];
      privatePlaceholders = [];
    }

    try {
      claimCandidates = await getClaimCandidatesForUser(currentUserDbId, {
        alternateNames: clerkNameCandidates,
        includeDismissed: false,
        limit: 5,
      });
    } catch (error) {
      console.error("Map page failed to load claim candidates", error);
      claimCandidates = [];
    }
  }

  const baseUrl =
    normalizeOrigin(process.env.NEXT_PUBLIC_APP_URL) ??
    getRequestOrigin(headersList) ??
    normalizeOrigin(process.env.VERCEL_URL) ??
    "http://localhost:3000";
  return (
    <>
      <RelationshipMap
        users={users}
        relationships={relationships}
        currentUserId={currentUserDbId}
        targetUserId={targetUserId}
        isSignedIn={sessionSignedIn}
        currentUserIsPro={currentUserIsPro}
        userConnections={userConnections}
        privatePlaceholders={privatePlaceholders}
        baseUrl={baseUrl}
        afterGraph={currentUserDbId ? (
          <ClaimConnectionsPanel
            initialCandidates={claimCandidates}
            mode="settings"
          />
        ) : null}
      />
    </>
  );
}
