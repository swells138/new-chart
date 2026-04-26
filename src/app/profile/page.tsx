import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { ClaimConnectionsPanel } from "@/components/profile/claim-connections-panel";
import { ConfirmClaimsPanel } from "@/components/profile/confirm-claims-panel";
import {
  ProfileConnectionsList,
  type ProfileConnectionItem,
} from "@/components/profile/profile-connections-list";
import { ProfileForm, type ProfileFormData } from "@/components/profile/profile-form";
import { SectionHeader } from "@/components/ui/section-header";
import { getClaimCandidatesForUser, getPendingCreatorConfirmations } from "@/lib/network-claims";
import { prisma } from "@/lib/prisma";
import { ensureDbUserByClerkId } from "@/lib/db-user-bootstrap";

export const dynamic = "force-dynamic";

const pendingTypePrefix = "pending::";

const hasClerkKeys =
  Boolean(process.env.CLERK_SECRET_KEY) &&
  Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ||
      process.env.CLERK_PUBLISHABLE_KEY
  );

async function getOrCreateProfile(clerkId: string) {
  const clerk = await currentUser();
  const fullName =
    clerk?.firstName && clerk?.lastName
      ? `${clerk.firstName} ${clerk.lastName}`
      : clerk?.username ||
        clerk?.firstName ||
        "New member";
  const user = await ensureDbUserByClerkId(clerkId, fullName);

  const [relationships, reverseRelationships] = await Promise.all([
    prisma.relationship.findMany({
      where: {
        user1Id: user.id,
        NOT: {
          type: {
            startsWith: pendingTypePrefix,
          },
        },
      },
      include: {
        user2: {
          select: {
            name: true,
            handle: true,
            location: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.relationship.findMany({
      where: {
        user2Id: user.id,
        NOT: {
          type: {
            startsWith: pendingTypePrefix,
          },
        },
      },
      include: {
        user1: {
          select: {
            name: true,
            handle: true,
            location: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return {
    ...user,
    relationships,
    reverseRelationships,
  };
}

export default async function ProfilePage() {
  if (!hasClerkKeys) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-[var(--border-soft)] bg-white/70 p-6 text-sm dark:bg-black/20">
        Auth is not configured yet. Add Clerk environment variables to enable profile management.
      </div>
    );
  }

  const { userId } = await auth();

  if (!userId) {
    redirect("/login");
  }

  const user = await getOrCreateProfile(userId);

  const initialProfile: ProfileFormData = {
    name: user.name ?? "",
    handle: user.handle ?? "",
    pronouns: user.pronouns ?? "",
    bio: user.bio ?? "",
    location: user.location ?? "",
    relationshipStatus: user.relationshipStatus ?? "",
    interests: user.interests ?? [],
  };

  const [claimCandidates, pendingConfirmations] = await Promise.all([
    getClaimCandidatesForUser(user.id, { includeDismissed: false, limit: 5 }),
    getPendingCreatorConfirmations(user.id),
  ]);

  const connections: ProfileConnectionItem[] = [
    ...user.relationships.map((relationship: { id: string; type: string; user2: ProfileConnectionItem["person"] }) => ({
      id: relationship.id,
      type: relationship.type,
      person: relationship.user2,
    })),
    ...user.reverseRelationships.map((relationship: { id: string; type: string; user1: ProfileConnectionItem["person"] }) => ({
      id: relationship.id,
      type: relationship.type,
      person: relationship.user1,
    })),
  ];

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Your Profile"
        subtitle="Update your public details and review your connections."
      />

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <ProfileForm initialProfile={initialProfile} />

        <aside className="paper-card rounded-2xl p-5">
          <h3 className="text-xl font-semibold">Your Connections</h3>
          <ProfileConnectionsList
            initialConnections={connections}
            currentUserId={user.id}
          />
        </aside>
      </div>

      {pendingConfirmations.length > 0 ? (
        <ConfirmClaimsPanel
          initialConfirmations={pendingConfirmations}
          currentUserId={user.id}
        />
      ) : null}

      <ClaimConnectionsPanel initialCandidates={claimCandidates} mode="settings" />
    </div>
  );
}
