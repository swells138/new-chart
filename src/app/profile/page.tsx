import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { ConfirmClaimsPanel } from "@/components/profile/confirm-claims-panel";
import {
  ProfileConnectionsList,
  type ProfileConnectionItem,
} from "@/components/profile/profile-connections-list";
import {
  ProfileForm,
  type ProfileFormData,
} from "@/components/profile/profile-form";
import { SectionHeader } from "@/components/ui/section-header";
import { getPendingCreatorConfirmations } from "@/lib/network-claims";
import { prisma } from "@/lib/prisma";
import { ensureDbUserByClerkId } from "@/lib/db-user-bootstrap";
import GoProButton from "@/components/profile/go-pro-button";
import { getEffectiveIsPro } from "@/lib/pro-user";

export const dynamic = "force-dynamic";

const pendingTypePrefix = "pending::";

function getConnectionScoreLabel(score: number) {
  if (score >= 50) {
    return "Top 10%";
  }

  if (score >= 25) {
    return "Top 25%";
  }

  return "Average";
}

function getConnectionPercentile(input: {
  usersWithLowerScores: number;
  totalUsers: number;
}) {
  if (input.totalUsers <= 1) {
    return 0;
  }

  return Math.round(
    (input.usersWithLowerScores / (input.totalUsers - 1)) * 100,
  );
}

const hasClerkKeys =
  Boolean(process.env.CLERK_SECRET_KEY) &&
  Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ||
    process.env.CLERK_PUBLISHABLE_KEY,
  );

function getClerkNameCandidates(
  clerk: Awaited<ReturnType<typeof currentUser>>,
) {
  if (!clerk) {
    return [];
  }

  return [
    [clerk.firstName, clerk.lastName].filter(Boolean).join(" "),
    clerk.fullName,
    clerk.username,
    clerk.firstName,
    clerk.lastName,
  ].filter((name): name is string => Boolean(name?.trim()));
}

function getClerkPrimaryEmail(clerk: Awaited<ReturnType<typeof currentUser>>) {
  const primaryEmailId = clerk?.primaryEmailAddressId;
  const primaryEmail = clerk?.emailAddresses.find(
    (email) => email.id === primaryEmailId,
  )?.emailAddress;

  return primaryEmail ?? clerk?.emailAddresses[0]?.emailAddress ?? null;
}

async function getOrCreateProfile(clerkId: string) {
  const clerk = await currentUser();
  const clerkNameCandidates = getClerkNameCandidates(clerk);
  const fullName =
    clerkNameCandidates[0] ||
    clerk?.username ||
    clerk?.firstName ||
    "New member";
  const user = await ensureDbUserByClerkId(
    clerkId,
    fullName,
    clerk?.imageUrl,
    getClerkPrimaryEmail(clerk),
  );

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
    clerkNameCandidates,
    relationships,
    reverseRelationships,
  };
}

export default async function ProfilePage() {
  if (!hasClerkKeys) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-[var(--border-soft)] bg-white/70 p-6 text-sm dark:bg-black/20">
        Auth is not configured yet. Add Clerk environment variables to enable
        profile management.
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

  const pendingConfirmations = await getPendingCreatorConfirmations(user.id);
  const connectionScore = user.connectionScore ?? 0;
  const connectionScoreLabel = getConnectionScoreLabel(connectionScore);
  const isPro = getEffectiveIsPro(user);
  const [totalUsers, usersWithLowerScores] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({
      where: {
        id: { not: user.id },
        connectionScore: { lt: connectionScore },
      },
    }),
  ]);
  const connectionPercentile = getConnectionPercentile({
    usersWithLowerScores,
    totalUsers,
  });

  const connections: ProfileConnectionItem[] = [
    ...user.relationships.map(
      (relationship: {
        id: string;
        type: string;
        user2: ProfileConnectionItem["person"];
      }) => ({
        id: relationship.id,
        type: relationship.type,
        person: relationship.user2,
      }),
    ),
    ...user.reverseRelationships.map(
      (relationship: {
        id: string;
        type: string;
        user1: ProfileConnectionItem["person"];
      }) => ({
        id: relationship.id,
        type: relationship.type,
        person: relationship.user1,
      }),
    ),
  ];

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Your Profile"
        subtitle="Update your public details and review your connections."
      />

      {pendingConfirmations.length > 0 ? (
        <ConfirmClaimsPanel
          initialConfirmations={pendingConfirmations}
          currentUserId={user.id}
        />
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <ProfileForm initialProfile={initialProfile} />

        <aside className="paper-card rounded-2xl p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="text-xl font-semibold">Your Connections</h3>
              <p className="mt-1 text-sm font-medium text-black/70 dark:text-white/75">
                Connection Score: {connectionScore}
              </p>
              <p className="mt-1 text-sm text-black/60 dark:text-white/65">
                You are more connected than {connectionPercentile}% of users
              </p>
            </div>
            <span className="w-fit rounded-full border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-3 py-1 text-xs font-bold text-[var(--accent)]">
              {connectionScoreLabel}
            </span>
          </div>
          {isPro ? (
            <div className="mt-2">
              <span className="inline-block rounded-full bg-[var(--accent)]/10 px-3 py-1 text-[var(--accent)] font-semibold">
                Pro
              </span>
            </div>
          ) : null}
          <ProfileConnectionsList
            initialConnections={connections}
            currentUserId={user.id}
          />

          <div className="mt-6">
            {!isPro ? <GoProButton dbUserId={user.id} /> : null}
          </div>
        </aside>
      </div>
    </div>
  );
}
