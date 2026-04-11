import { auth, currentUser } from "@clerk/nextjs/server";
import { RelationshipMap } from "@/components/map/relationship-map";
import { SectionHeader } from "@/components/ui/section-header";
import { prisma } from "@/lib/prisma";
import { getAllRelationships, getAllUsers, getRelationshipsByUser, getUsersByLocation } from "@/lib/prisma-queries";

export const dynamic = "force-dynamic";

const hasClerkKeys =
  Boolean(process.env.CLERK_SECRET_KEY) &&
  Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

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

  let users = await getAllUsers();
  const relationships = await getAllRelationships();
  let areaUsers: typeof users = [];
  let userConnections: typeof relationships = [];

  // If user has a location and no connections yet, get users from their area
  if (currentUserDbId && currentUserLocation) {
    userConnections = await getRelationshipsByUser(currentUserDbId);
    
    // If user has no connections, show area users
    if (userConnections.length === 0) {
      areaUsers = await getUsersByLocation(currentUserLocation);
      // Use area users if available, otherwise fall back to all users
      users = areaUsers.length > 0 ? areaUsers : users;
    } else {
      // If user has connections, keep all users but mark that they have connections
      areaUsers = await getUsersByLocation(currentUserLocation);
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
