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
        className="rise-in relative overflow-hidden rounded-3xl px-6 py-16 text-center sm:px-10 sm:py-20 lg:min-h-[68vh] lg:px-14"
        style={{ background: "linear-gradient(135deg, #0f0819 0%, #130d24 100%)" }}
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(255,143,132,0.22),transparent_45%)]" aria-hidden />

        <div className="relative z-10 mx-auto flex max-w-4xl flex-col items-center justify-center lg:min-h-[56vh]">
          <h1 className="text-balance text-4xl leading-tight font-bold text-white sm:text-6xl lg:text-7xl">
            See How Everyone Is Connected
          </h1>
          <p className="mt-6 max-w-2xl text-base text-white/70 sm:text-lg">
            Build and explore a live map of relationships - discover who knows who and uncover hidden connections.
          </p>
          <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row">
            <a
              href={isSignedIn ? "/map" : "#start"}
              className="inline-flex min-w-44 items-center justify-center rounded-full bg-[#ff8f84] px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-[#ff8f84]/30 transition hover:-translate-y-0.5 hover:brightness-95"
            >
              Start Mapping
            </a>
            <a
              href="#demo"
              className="inline-flex min-w-44 items-center justify-center rounded-full border border-white/25 bg-white/10 px-8 py-3.5 text-base font-semibold text-white/90 backdrop-blur transition hover:-translate-y-0.5 hover:bg-white/15"
            >
              View Demo
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
      <section id="demo" className="scroll-mt-24 py-8 sm:py-10">
        <div className="paper-card mx-auto max-w-5xl rounded-3xl p-5 sm:p-7">
          <div className="text-center">
            <h2 className="text-2xl font-semibold sm:text-3xl">
              Explore a sample connection map
            </h2>
            <p className="mt-2 text-sm text-black/60 dark:text-white/60 sm:text-base">
              Click a person to see how they connect.
            </p>
          </div>

          <div className="mt-5 overflow-hidden rounded-2xl border border-black/10 bg-white/45 p-2 shadow-inner dark:border-white/15 dark:bg-black/20 sm:p-3">
            <DemoGraph />
          </div>

          {/* Legend */}
          <div className="mt-5 flex flex-wrap justify-center gap-x-5 gap-y-2">
            {EDGE_LEGEND.map(({ label, color }) => (
              <div key={label} className="flex items-center gap-1.5 text-xs">
                <div className="h-2 w-5 rounded-full" style={{ background: color }} />
                <span className="text-black/55 dark:text-white/55">{label}</span>
              </div>
            ))}
          </div>
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
