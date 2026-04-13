import { auth, currentUser } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { RelationshipMap } from "@/components/map/relationship-map";
import { SectionHeader } from "@/components/ui/section-header";
import { prisma } from "@/lib/prisma";
import { getAllRelationships, getAllUsers, getPrivateConnectionsByUser, getRelationshipsByUser } from "@/lib/prisma-queries";

export const dynamic = "force-dynamic";

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

function getStateCode(location: string | null) {
  if (!location) {
    return null;
  }

  const parts = location.split(",");
  const state = parts[parts.length - 1]?.trim();
  if (!state) {
    return null;
  }

  return state.toUpperCase();
}

function buildAreaUsers(
  allUsers: Awaited<ReturnType<typeof getAllUsers>>,
  currentUserId: string,
  currentUserLocation: string
) {
  let areaUsers = allUsers.filter(
    (user) =>
      user.location.trim().toLowerCase() === currentUserLocation.trim().toLowerCase()
  );

  if (areaUsers.length <= 1) {
    const currentState = getStateCode(currentUserLocation);
    if (currentState) {
      const stateMatches = allUsers.filter(
        (user) => user.id !== currentUserId && getStateCode(user.location) === currentState
      );

      areaUsers = areaUsers.concat(
        stateMatches.filter((candidate) => !areaUsers.some((existing) => existing.id === candidate.id))
      );
    }
  }

  if (areaUsers.length <= 1) {
    areaUsers = allUsers.filter((user) => user.id !== currentUserId).slice(0, 12);
    const currentUser = allUsers.find((user) => user.id === currentUserId);
    if (currentUser) {
      areaUsers = [currentUser, ...areaUsers];
    }
  }

  return areaUsers;
}

export default async function MapPage() {
  let currentUserDbId: string | null = null;
  let currentUserLocation: string | null = null;
  const cookieStore = await cookies();
  const hasSessionCookie = cookieStore.has("__session");
  let sessionSignedIn = hasSessionCookie;

  if (hasClerkKeys) {
    try {
      const userId = await resolveClerkUserId();
      sessionSignedIn = Boolean(userId) || hasSessionCookie;

      if (userId) {
        const existing = await prisma.user.findUnique({
          where: { clerkId: userId },
          select: { id: true, location: true },
        });

        if (existing) {
          currentUserDbId = existing.id;
          currentUserLocation = existing.location;
        } else {
          const clerk = await currentUser();
          const fullName = [clerk?.firstName, clerk?.lastName].filter(Boolean).join(" ").trim();

          try {
            const created = await prisma.user.create({
              data: {
                clerkId: userId,
                name: fullName || clerk?.username || "New member",
              },
              select: { id: true, location: true },
            });

            currentUserDbId = created.id;
            currentUserLocation = created.location;
          } catch (error) {
            const prismaError = error as { code?: string };

            if (prismaError.code === "P2002") {
              const retry = await prisma.user.findUnique({
                where: { clerkId: userId },
                select: { id: true, location: true },
              });

              if (retry) {
                currentUserDbId = retry.id;
                currentUserLocation = retry.location;
              }
            } else {
              throw error;
            }
          }
        }
      }
    } catch (error) {
      console.error("Map page failed to initialize authenticated user", error);
      currentUserDbId = null;
      currentUserLocation = null;
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

  let users = allUsers;
  let areaUsers: typeof users = [];
  let userConnections: typeof relationships = [];
  let privatePlaceholders = [] as Awaited<ReturnType<typeof getPrivateConnectionsByUser>>;

  // If user has a location, always build area users with fallbacks
  if (currentUserDbId && currentUserLocation) {
    try {
      [userConnections, privatePlaceholders] = await Promise.all([
        getRelationshipsByUser(currentUserDbId),
        getPrivateConnectionsByUser(currentUserDbId),
      ]);
      areaUsers = buildAreaUsers(allUsers, currentUserDbId, currentUserLocation);
    } catch (error) {
      console.error("Map page failed to load user-scoped network data", error);
      userConnections = [];
      privatePlaceholders = [];
      areaUsers = [];
    }

    // If user has no connections, start them in area mode data.
    if (userConnections.length === 0) {
      users = areaUsers.length > 0 ? areaUsers : allUsers;
    }
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL
      ? process.env.VERCEL_URL.startsWith("http")
        ? process.env.VERCEL_URL
        : `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000");

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Your Network"
        subtitle="Manage direct connections, verify pending matches, and explore the confirmed network around you."
      />
      <RelationshipMap
        users={users}
        relationships={relationships}
        currentUserId={currentUserDbId}
        isSignedIn={sessionSignedIn}
        userConnections={userConnections}
        areaUsers={areaUsers}
        privatePlaceholders={privatePlaceholders}
        baseUrl={baseUrl}
      />
    </div>
  );
}
