import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { MemberCard } from "@/components/cards/member-card";
import { SectionHeader } from "@/components/ui/section-header";
import {
  getApprovedConnectionUserIds,
  getAllRelationships,
  getAllUsers,
} from "@/lib/prisma-queries";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const hasClerkKeys =
  Boolean(process.env.CLERK_SECRET_KEY) &&
  Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

const connectionLabels: Record<string, string> = {
  friends: "became friends",
  married: "got married",
  exes: "are exes",
  collaborators: "started collaborating",
  roommates: "became roommates",
  crushes: "have a crush on each other",
  mentors: "connected as mentor & mentee",
};

export default async function Home() {
  let currentUserDbId: string | null = null;

  if (hasClerkKeys) {
    const { userId } = await auth();
    if (userId) {
      const user = await prisma.user.findUnique({
        where: { clerkId: userId },
        select: { id: true },
      });
      currentUserDbId = user?.id ?? null;
    }
  }

  const [users, relationships] = await Promise.all([
    getAllUsers(),
    getAllRelationships(),
  ]);

  const connectedIds = currentUserDbId ? await getApprovedConnectionUserIds(currentUserDbId) : [];
  const connectedSet = new Set(connectedIds);

  const membersOrdered = [...users].sort((a, b) => {
    const aConnected = connectedSet.has(a.id) ? 1 : 0;
    const bConnected = connectedSet.has(b.id) ? 1 : 0;
    if (aConnected !== bConnected) {
      return bConnected - aConnected;
    }
    return Number(b.featured) - Number(a.featured);
  });

  const relationshipsOrdered = [...relationships].sort((a, b) => {
    const aConnected = connectedSet.has(a.source) || connectedSet.has(a.target) ? 1 : 0;
    const bConnected = connectedSet.has(b.source) || connectedSet.has(b.target) ? 1 : 0;
    if (aConnected !== bConnected) {
      return bConnected - aConnected;
    }
    return 0;
  });

  const featuredMembers = membersOrdered.slice(0, 3);
  const featuredConnections = relationshipsOrdered.slice(0, 3);
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
            subtitle="Fresh connection activity from across the network."
          />
          {featuredConnections.map((connection) => {
            const source = userById.get(connection.source);
            const target = userById.get(connection.target);
            if (!source || !target) return null;

            return (
              <article
                key={connection.id}
                className="paper-card rounded-2xl p-5 transition hover:-translate-y-0.5"
              >
                <p className="text-sm font-semibold">
                  {source.name} <span className="font-normal text-black/60 dark:text-white/65">&amp;</span> {target.name}
                </p>
                <p className="mt-1 text-sm text-black/70 dark:text-white/80">
                  {connectionLabels[connection.type] ?? "connected"}
                </p>
              </article>
            );
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
        </aside>
      </section>
    </div>
  );
}
