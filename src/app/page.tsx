import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { MemberCard } from "@/components/cards/member-card";
import { SectionHeader } from "@/components/ui/section-header";
import { DemoGraph } from "@/components/home/demo-graph";
import { GuestChartBuilder } from "@/components/home/guest-chart-builder";
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
  Exes: "are exes",
  Married: "got married",
  "Sneaky Link": "are in a sneaky link",
  Friends: "became friends",
  Lovers: "are lovers",
  "One Night Stand": "had a one night stand",
  complicated: "have a complicated connection",
  FWB: "are friends with benefits",
};

const EDGE_LEGEND = [
  { label: "Dating",       color: "#f472b6" },
  { label: "Friends",      color: "#66b6a7" },
  { label: "Exes",         color: "#ff8f84" },
  { label: "Situationship",color: "#fb923c" },
  { label: "Talking",      color: "#a78bfa" },
  { label: "Complicated",  color: "#7aa2ff" },
];

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

  const connectedIds = currentUserDbId
    ? await getApprovedConnectionUserIds(currentUserDbId)
    : [];
  const connectedSet = new Set(connectedIds);

  const membersOrdered = [...users].sort((a, b) => {
    const aConnected = connectedSet.has(a.id) ? 1 : 0;
    const bConnected = connectedSet.has(b.id) ? 1 : 0;
    if (aConnected !== bConnected) return bConnected - aConnected;
    return Number(b.featured) - Number(a.featured);
  });

  const relationshipsOrdered = [...relationships].sort((a, b) => {
    const aConnected =
      connectedSet.has(a.source) || connectedSet.has(a.target) ? 1 : 0;
    const bConnected =
      connectedSet.has(b.source) || connectedSet.has(b.target) ? 1 : 0;
    if (aConnected !== bConnected) return bConnected - aConnected;
    return 0;
  });

  const featuredMembers = membersOrdered.slice(0, 3);
  const featuredConnections = relationshipsOrdered.slice(0, 3);
  const userById = new Map(users.map((user) => [user.id, user]));
  const isSignedIn = Boolean(currentUserDbId);

  return (
    <div className="space-y-16 pb-12">

      {/* ─── HERO ─────────────────────────────────────────────── */}
      <section
        className="rise-in relative overflow-hidden rounded-3xl px-6 py-16 sm:px-14 sm:py-20"
        style={{ background: "linear-gradient(135deg, #0f0819 0%, #130d24 100%)" }}
      >
        {/* Decorative blobs */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
          <div className="hero-blob absolute -top-20 left-[15%] h-72 w-72 rounded-full bg-[#ff8f84]/20 blur-3xl" />
          <div className="hero-blob absolute top-10 right-[15%] h-56 w-56 rounded-full bg-[#a78bfa]/20 blur-3xl" style={{ animationDelay: "3s" }} />
          <div className="hero-blob absolute bottom-0 left-[40%] h-40 w-40 rounded-full bg-[#66b6a7]/15 blur-3xl" style={{ animationDelay: "6s" }} />
        </div>

        <div className="relative z-10 max-w-3xl">
          <p className="script text-2xl leading-none text-[#ff8f84] sm:text-3xl">
            for the ones who know
          </p>
          <h1 className="mt-3 text-[2.6rem] leading-tight font-semibold text-white sm:text-6xl lg:text-7xl">
            Who&apos;s connected<br className="hidden sm:block" /> to who?&nbsp;👀
          </h1>
          <p className="mt-5 max-w-xl text-base text-white/65 sm:text-lg">
            Create your own private connection chart and discover how people are linked.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href={isSignedIn ? "/map" : "#start"}
              className="rounded-full bg-[#ff8f84] px-7 py-3.5 text-sm font-semibold text-white shadow-lg shadow-[#ff8f84]/30 transition hover:brightness-95 hover:-translate-y-0.5"
            >
              {isSignedIn ? "Open your chart" : "Start your chart"}
            </a>
            <a
              href="#demo"
              className="rounded-full border border-white/20 bg-white/8 px-7 py-3.5 text-sm font-semibold text-white/85 backdrop-blur transition hover:bg-white/15 hover:-translate-y-0.5"
            >
              View example
            </a>
          </div>
        </div>
      </section>

      {/* ─── SOCIAL PROOF HOOK ────────────────────────────────── */}
      <section className="text-center">
        <p className="text-xs font-bold uppercase tracking-widest text-[var(--accent)]/70">
          The network effect
        </p>
        <h2 className="mt-3 text-3xl font-semibold sm:text-4xl">
          See how close you are to anyone
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-base text-black/60 dark:text-white/60">
          Map your world — and discover you&apos;re only{" "}
          <strong className="text-[var(--accent)]">2 connections away</strong> from people you&apos;d never expect.
        </p>
        <div className="mt-8 flex justify-center gap-10 sm:gap-16">
          {[
            { stat: "1°", label: "Direct connections" },
            { stat: "2°", label: "Friends of friends" },
            { stat: "3°", label: "Broader network" },
          ].map(({ stat, label }) => (
            <div key={stat} className="text-center">
              <p className="text-4xl font-bold text-[var(--accent)]">{stat}</p>
              <p className="mt-1 text-xs text-black/50 dark:text-white/50">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── DEMO GRAPH ───────────────────────────────────────── */}
      <section id="demo" className="scroll-mt-24 space-y-4">
        <div className="text-center">
          <h2 className="text-2xl font-semibold sm:text-3xl">See it in action</h2>
          <p className="mt-2 text-sm text-black/55 dark:text-white/55">
            This is what a real connection chart looks like — hover the nodes.
          </p>
        </div>

        <DemoGraph />

        {/* Legend */}
        <div className="flex flex-wrap justify-center gap-x-5 gap-y-2">
          {EDGE_LEGEND.map(({ label, color }) => (
            <div key={label} className="flex items-center gap-1.5 text-xs">
              <div className="h-2 w-5 rounded-full" style={{ background: color }} />
              <span className="text-black/55 dark:text-white/55">{label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ─── GUEST CHART BUILDER ──────────────────────────────── */}
      {!isSignedIn ? <GuestChartBuilder /> : null}

      {/* ─── FEATURED MEMBERS ─────────────────────────────────── */}
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
        <div className="text-center">
          <Link
            href="/members"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--accent)] transition hover:underline"
          >
            Browse all members →
          </Link>
        </div>
      </section>

      {/* ─── RECENT CONNECTIONS ───────────────────────────────── */}
      <section className="space-y-4">
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
                {source.name}{" "}
                <span className="font-normal text-black/60 dark:text-white/65">&amp;</span>{" "}
                {target.name}
              </p>
              <p className="mt-1 text-sm text-black/70 dark:text-white/80">
                {connectionLabels[connection.type] ?? "connected"}
              </p>
            </article>
          );
        })}
        <div className="text-center">
          <Link
            href="/feed"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--accent)] transition hover:underline"
          >
            View full feed →
          </Link>
        </div>
      </section>

    </div>
  );
}
