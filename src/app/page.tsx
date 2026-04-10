import Link from "next/link";
import { users, posts, articles, relationships } from "@/lib/data";
import { MemberCard } from "@/components/cards/member-card";
import { PostCard } from "@/components/cards/post-card";
import { ArticleCard } from "@/components/cards/article-card";
import { SectionHeader } from "@/components/ui/section-header";

export default function Home() {
  const featuredMembers = users.filter((user) => user.featured).slice(0, 3);
  const featuredPosts = posts.slice(0, 3);
  const featuredStories = articles.slice(0, 2);
  const userById = new Map(users.map((user) => [user.id, user]));

  return (
    <div className="space-y-12 pb-8">
      <section className="paper-card rise-in relative overflow-hidden rounded-3xl p-6 sm:p-10">
        {/* Customize this hero title/tagline/CTAs to fit your own community brand voice. */}
        <div className="absolute top-4 right-6 rounded-full border border-[var(--border-soft)] bg-white/60 px-3 py-1 text-xs tracking-[0.2em] uppercase dark:bg-black/20">
          beta circle
        </div>
        <p className="script text-[1.55rem] leading-none text-[var(--accent)] sm:text-[2.1rem]">
          A softer web for chosen family.
        </p>
        <h1 className="mt-4 max-w-3xl text-4xl leading-tight font-semibold sm:text-6xl">
          Meshy Links is where friendships, stories, and messy lines between us come alive.
        </h1>
        <p className="mt-5 max-w-2xl text-lg text-black/70 dark:text-white/80">
          Explore profiles, publish updates, trace connection arcs, and keep the community pulse close.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/map"
            className="rounded-full bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-white transition hover:brightness-95"
          >
            Open Connection Map
          </Link>
          <Link
            href="/feed"
            className="rounded-full border border-[var(--border-soft)] bg-white/70 px-6 py-3 text-sm font-semibold transition hover:-translate-y-0.5 dark:bg-black/20"
          >
            Enter Community Feed
          </Link>
        </div>
      </section>

      <section className="space-y-4">
        <SectionHeader
          title="Featured Members"
          subtitle="A rotating spotlight from this week's most active profiles."
        />
        <div className="grid gap-4 md:grid-cols-3">
          {featuredMembers.map((member) => (
            <MemberCard key={member.id} user={member} />
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <SectionHeader
            title="Latest from the Feed"
            subtitle="Personal updates, tiny wins, and late-night thoughts."
          />
          {featuredPosts.map((post) => {
            const author = userById.get(post.userId);
            if (!author) return null;

            return <PostCard key={post.id} post={post} author={author} />;
          })}
        </div>
        <aside className="space-y-4">
          <SectionHeader
            title="Map Preview"
            subtitle="Tap into how everyone connects."
          />
          <div className="paper-card rounded-2xl p-5">
            <p className="text-sm text-black/70 dark:text-white/80">
              Right now the network tracks <span className="font-bold">{users.length}</span> members and{" "}
              <span className="font-bold">{relationships.length}</span> visible connection paths.
            </p>
            <div className="mt-4 flex flex-wrap gap-2 text-xs">
              {["friends", "exes", "collaborators", "roommates"].map((label) => (
                <span
                  key={label}
                  className="rounded-full border border-[var(--border-soft)] px-3 py-1 uppercase tracking-wide"
                >
                  {label}
                </span>
              ))}
            </div>
            <Link
              href="/map"
              className="mt-5 inline-block rounded-full border border-[var(--border-soft)] px-4 py-2 text-sm font-semibold hover:bg-white/80 dark:hover:bg-black/30"
            >
              Explore full map
            </Link>
          </div>
          {featuredStories.map((story) => (
            <ArticleCard key={story.id} article={story} compact />
          ))}
        </aside>
      </section>
    </div>
  );
}
