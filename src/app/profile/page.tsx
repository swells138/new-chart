import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { ProfileForm, type ProfileFormData } from "@/components/profile/profile-form";
import { SectionHeader } from "@/components/ui/section-header";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const hasClerkKeys =
  Boolean(process.env.CLERK_SECRET_KEY) &&
  Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

function normalizeLinks(input: unknown): { website?: string; social?: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }

  const record = input as Record<string, unknown>;

  return {
    ...(typeof record.website === "string" && record.website.trim().length > 0
      ? { website: record.website.trim() }
      : {}),
    ...(typeof record.social === "string" && record.social.trim().length > 0
      ? { social: record.social.trim() }
      : {}),
  };
}

function formatTimestamp(timestamp: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(timestamp);
}

async function getOrCreateProfile(clerkId: string) {
  const existing = await prisma.user.findUnique({
    where: { clerkId },
    include: {
      posts: {
        orderBy: { timestamp: "desc" },
        take: 5,
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
      posts: {
        orderBy: { timestamp: "desc" },
        take: 5,
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
    links: normalizeLinks(user.links),
  };

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Your Profile"
        subtitle="Update your public details and check your latest posts."
      />

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <ProfileForm initialProfile={initialProfile} />

        <aside className="paper-card rounded-2xl p-5">
          <h3 className="text-xl font-semibold">Recent Posts</h3>
          {user.posts.length === 0 ? (
            <p className="mt-3 text-sm text-black/70 dark:text-white/75">
              You have not posted yet. Your next update will appear here.
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              {user.posts.map((post) => (
                <article key={post.id} className="rounded-xl border border-[var(--border-soft)] p-3 text-sm">
                  <p>{post.content}</p>
                  <p className="mt-2 text-xs text-black/60 dark:text-white/70">
                    {formatTimestamp(post.timestamp)} · {post.likes} likes · {post.comments} comments
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
