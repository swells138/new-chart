import { MemberCard } from "@/components/cards/member-card";
import { PostCard } from "@/components/cards/post-card";
import { SectionHeader } from "@/components/ui/section-header";
import { posts, users } from "@/lib/data";

export default function FeedPage() {
  const tagCounts = posts
    .flatMap((post) => post.tags)
    .reduce<Record<string, number>>((acc, tag) => {
      acc[tag] = (acc[tag] ?? 0) + 1;
      return acc;
    }, {});

  const trending = Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  const featuredUsers = users.filter((user) => user.featured);

  return (
    <div className="grid gap-4 lg:grid-cols-[1.4fr_0.8fr]">
      <section className="space-y-4">
        <SectionHeader
          title="Community Feed"
          subtitle="The pulse of daily updates, conversations, and collaborative sparks."
        />
        {posts.map((post) => (
          <PostCard key={post.id} post={post} />
        ))}
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
