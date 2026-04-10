import { auth, currentUser } from "@clerk/nextjs/server";
import { RelationshipMap } from "@/components/map/relationship-map";
import { SectionHeader } from "@/components/ui/section-header";
import { prisma } from "@/lib/prisma";
import { getAllRelationships, getAllUsers } from "@/lib/prisma-queries";

export const dynamic = "force-dynamic";

const hasClerkKeys =
  Boolean(process.env.CLERK_SECRET_KEY) &&
  Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

export default async function MapPage() {
  let currentUserDbId: string | null = null;

  if (hasClerkKeys) {
    const { userId } = await auth();

    if (userId) {
      const existing = await prisma.user.findUnique({
        where: { clerkId: userId },
        select: { id: true },
      });

      if (existing) {
        currentUserDbId = existing.id;
      } else {
        const clerk = await currentUser();
        const fullName = [clerk?.firstName, clerk?.lastName].filter(Boolean).join(" ").trim();

        const created = await prisma.user.create({
          data: {
            clerkId: userId,
            name: fullName || clerk?.username || "New member",
          },
          select: { id: true },
        });

        currentUserDbId = created.id;
      }
    }
  }

  const [users, relationships] = await Promise.all([getAllUsers(), getAllRelationships()]);

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Relationship Map"
        subtitle="Click nodes to open details, drag to connect, and edit only connections that include your own profile."
      />
      <RelationshipMap users={users} relationships={relationships} currentUserId={currentUserDbId} />
    </div>
  );
}
