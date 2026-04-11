import { auth, currentUser } from "@clerk/nextjs/server";
import { MemberCard } from "@/components/cards/member-card";
import { PostCard } from "@/components/cards/post-card";
import { SectionHeader } from "@/components/ui/section-header";
import { prisma } from "@/lib/prisma";
import { getAllPosts, getAllUsers, getApprovedConnectionUserIds, getPostsByLocation, getRelationshipsByUser } from "@/lib/prisma-queries";
import type { Relationship, Post } from "@/types/models";

export const dynamic = "force-dynamic";

export default async function FeedPage() {
  let currentUserDbId: string | null = null;
  let currentUserLocation: string | null = null;

  // Get current user's location
  const { userId } = await auth();
  if (userId) {
    const user = await prisma.user.findUnique({
      where: { clerkId: userId },
      select: { id: true, location: true },
    });
    if (user) {
      currentUserDbId = user.id;
      currentUserLocation = user.location;
    }
  }

  const [posts, users] = await Promise.all([getAllPosts(), getAllUsers()]);
  const userById = new Map(users.map((user) => [user.id, user]));

  // Get user's connections if they have a DB ID
  let userConnections: Relationship[] = [];
  let areaPosts: Post[] = [];
  if (currentUserDbId) {
    userConnections = await getRelationshipsByUser(currentUserDbId);
  }

  // Get posts from area if user has a location
  if (currentUserLocation && userConnections.length === 0) {
    areaPosts = await getPostsByLocation(currentUserLocation);
  }

  const connectedIds = currentUserDbId ? await getApprovedConnectionUserIds(currentUserDbId) : [];
  const connectedSet = new Set(connectedIds);

  // Determine which posts to show: connected activity first on feed
  const basePosts = userConnections.length > 0
    ? posts
    : areaPosts.length > 0
      ? areaPosts
      : posts;

  const displayedPosts = [...basePosts].sort((a, b) => {
    const aConnected = connectedSet.has(a.userId) ? 1 : 0;
    const bConnected = connectedSet.has(b.userId) ? 1 : 0;
    if (aConnected !== bConnected) {
      return bConnected - aConnected;
    }
    return 0;
  });

  const tagCounts = displayedPosts
    .flatMap((post) => post.tags)
    .reduce<Record<string, number>>((acc, tag) => {
      acc[tag] = (acc[tag] ?? 0) + 1;
      return acc;
    }, {});

  const trending = Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  const featuredUsers = [...users].sort((a, b) => {
    const aConnected = connectedSet.has(a.id) ? 1 : 0;
    const bConnected = connectedSet.has(b.id) ? 1 : 0;
    if (aConnected !== bConnected) {
      return bConnected - aConnected;
    }
    return Number(b.featured) - Number(a.featured);
  });

  return (
    <div className="grid gap-4 lg:grid-cols-[1.4fr_0.8fr]">
      <section className="space-y-4">
        <SectionHeader
          title="Community Feed"
          subtitle="The pulse of daily updates, conversations, and collaborative sparks."
        />
        {displayedPosts.map((post) => {
          const author = userById.get(post.userId);
          if (!author) return null;

          return <PostCard key={post.id} post={post} author={author} />;
        })}
      </section>

      <aside className="space-y-4">
        <div className="paper-card rounded-2xl p-5">
          <h3 className="text-lg font-semibold">Trending Tags</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {trending.map(([tag, count]) => (
              <span
                key={tag}
                className="rounded-full border border-[var(--border-soft)] px-3 py-1 text-xs"
              >
                #{tag} · {count}
              </span>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <h3 className="text-lg font-semibold">Featured Users</h3>
          {featuredUsers.map((user) => (
            <MemberCard key={user.id} user={user} />
          ))}
        </div>
      </aside>
    </div>
  );
}
