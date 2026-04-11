import { auth, currentUser } from "@clerk/nextjs/server";
import { RelationshipMap } from "@/components/map/relationship-map";
import { SectionHeader } from "@/components/ui/section-header";
import { prisma } from "@/lib/prisma";
import { getAllRelationships, getAllUsers, getRelationshipsByUser, getUsersByLocation } from "@/lib/prisma-queries";

export const dynamic = "force-dynamic";

const hasClerkKeys =
  Boolean(process.env.CLERK_SECRET_KEY) &&
  Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

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

  if (hasClerkKeys) {
    const { userId } = await auth();

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

        const created = await prisma.user.create({
          data: {
            clerkId: userId,
            name: fullName || clerk?.username || "New member",
          },
          select: { id: true, location: true },
        });

        currentUserDbId = created.id;
        currentUserLocation = created.location;
      }
    }
  }

  const allUsers = await getAllUsers();
  let users = allUsers;
  const relationships = await getAllRelationships();
  let areaUsers: typeof users = [];
  let userConnections: typeof relationships = [];

  // If user has a location, always build area users with fallbacks
  if (currentUserDbId && currentUserLocation) {
    userConnections = await getRelationshipsByUser(currentUserDbId);
    areaUsers = buildAreaUsers(allUsers, currentUserDbId, currentUserLocation);

    // If user has no connections, start them in area mode data.
    if (userConnections.length === 0) {
      users = areaUsers.length > 0 ? areaUsers : allUsers;
    }
  }

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Relationship Map"
        subtitle="Click nodes to open details, drag to connect, and edit only connections that include your own profile."
      />
      <RelationshipMap 
        users={users} 
        relationships={relationships} 
        currentUserId={currentUserDbId}
        userConnections={userConnections}
        areaUsers={areaUsers}
        currentUserLocation={currentUserLocation}
      />
    </div>
  );
}
