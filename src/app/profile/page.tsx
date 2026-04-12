import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { ProfileForm, type ProfileFormData } from "@/components/profile/profile-form";
import { SectionHeader } from "@/components/ui/section-header";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const pendingTypePrefix = "pending::";

const connectionLabels: Record<string, string> = {
  Exes: "Exes",
  Married: "Married",
  "Sneaky Link": "Sneaky Link",
  Friends: "Friends",
  Lovers: "Lovers",
  "One Night Stand": "One Night Stand",
  complicated: "complicated",
  FWB: "FWB",
};

const hasClerkKeys =
  Boolean(process.env.CLERK_SECRET_KEY) &&
  Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

interface ProfileConnection {
  id: string;
  type: string;
  person: {
    name: string | null;
    handle: string | null;
    location: string | null;
  };
}

async function getOrCreateProfile(clerkId: string) {
  const existing = await prisma.user.findUnique({
    where: { clerkId },
    include: {
      relationships: {
        where: {
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
      },
      reverseRelationships: {
        where: {
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
      },
    },
  });

  if (existing) {
    return existing;
  }

  const clerk = await currentUser();
  const fullName = [clerk?.firstName, clerk?.lastName].filter(Boolean).join(" ").trim();
  const email = clerk?.emailAddresses?.[0]?.emailAddress;

  return prisma.user.create({
    data: {
      clerkId,
      name: fullName || clerk?.username || "New member",
      email,
      handle: clerk?.username || null,
    },
    include: {
      relationships: {
        where: {
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
      },
      reverseRelationships: {
        where: {
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
      },
    },
  });
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
    interests: user.interests,
  };

  const connections: ProfileConnection[] = [
    ...user.relationships.map((relationship: { id: string; type: string; user2: ProfileConnection["person"] }) => ({
      id: relationship.id,
      type: relationship.type,
      person: relationship.user2,
    })),
    ...user.reverseRelationships.map((relationship: { id: string; type: string; user1: ProfileConnection["person"] }) => ({
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
          {connections.length === 0 ? (
            <p className="mt-3 text-sm text-black/70 dark:text-white/75">
              You do not have any approved connections yet.
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              {connections.map((connection) => (
                <article
                  key={connection.id}
                  className="rounded-xl border border-[var(--border-soft)] p-3 text-sm"
                >
                  <p className="font-semibold">
                    {connection.person.name ?? connection.person.handle ?? "Unnamed member"}
                  </p>
                  <p className="mt-1 text-xs text-black/60 dark:text-white/70">
                    {connectionLabels[connection.type] ?? "Connection"}
                    {connection.person.location ? ` · ${connection.person.location}` : ""}
                  </p>
                </article>
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
