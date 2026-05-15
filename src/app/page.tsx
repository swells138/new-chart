import { auth } from "@clerk/nextjs/server";
import { DemoGraph } from "@/components/home/demo-graph";
import { GuestChartBuilder } from "@/components/home/guest-chart-builder";
import {
  relationships as fallbackRelationships,
  users as fallbackUsers,
} from "@/lib/data";
import { prisma } from "@/lib/prisma";
import { getAllRelationships, getAllUsers } from "@/lib/prisma-queries";
import type { Relationship, User } from "@/types/models";

export const dynamic = "force-dynamic";

const hasClerkKeys =
  Boolean(process.env.CLERK_SECRET_KEY) &&
  Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

const EDGE_LEGEND = [
  { label: "Dating", color: "#f472b6" },
  { label: "Exes", color: "#ff8f84" },
  { label: "Situationship", color: "#fb923c" },
  { label: "Talking", color: "#a78bfa" },
  { label: "Complicated", color: "#7aa2ff" },
];

type MostConnectedStats = {
  person: {
    user: User;
    connectionCount: number;
  } | null;
  uniqueRelationshipCount: number;
};

type MostConnectedPerson = {
  user: User;
  connectionCount: number;
} | null;

function getUniquePairKey(source: string, target: string) {
  return [source, target].sort().join(":");
}

function getMostConnectedPerson(
  chartUsers: User[],
  chartRelationships: Relationship[],
): MostConnectedStats {
  const usersById = new Map(chartUsers.map((user) => [user.id, user]));
  const neighborsByUserId = new Map<string, Set<string>>();
  const uniqueRelationshipKeys = new Set<string>();

  for (const relationship of chartRelationships) {
    const { source, target } = relationship;

    if (!source || !target || source === target) {
      continue;
    }

    if (!usersById.has(source) || !usersById.has(target)) {
      continue;
    }

    const uniqueKey = getUniquePairKey(source, target);
    if (uniqueRelationshipKeys.has(uniqueKey)) {
      continue;
    }

    uniqueRelationshipKeys.add(uniqueKey);

    const sourceNeighbors = neighborsByUserId.get(source) ?? new Set<string>();
    sourceNeighbors.add(target);
    neighborsByUserId.set(source, sourceNeighbors);

    const targetNeighbors = neighborsByUserId.get(target) ?? new Set<string>();
    targetNeighbors.add(source);
    neighborsByUserId.set(target, targetNeighbors);
  }

  let mostConnected: MostConnectedPerson = null;

  for (const user of chartUsers) {
    const connectionCount = neighborsByUserId.get(user.id)?.size ?? 0;

    if (!mostConnected || connectionCount > mostConnected.connectionCount) {
      mostConnected = {
        user,
        connectionCount,
      };
    }
  }

  return {
    person: mostConnected?.connectionCount ? mostConnected : null,
    uniqueRelationshipCount: uniqueRelationshipKeys.size,
  };
}

export default async function Home() {
  let currentUserDbId: string | null = null;
  let chartUsers = fallbackUsers;
  let chartRelationships = fallbackRelationships;

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

  try {
    [chartUsers, chartRelationships] = await Promise.all([
      getAllUsers(),
      getAllRelationships(),
    ]);
  } catch (error) {
    console.error("Home page failed to load public network data", error);
  }

  const isSignedIn = Boolean(currentUserDbId);
  const mostConnectedStats = getMostConnectedPerson(
    chartUsers,
    chartRelationships,
  );
  const mostConnectedPerson = mostConnectedStats.person;

  return (
    <div className="space-y-16 pb-12">
      {/* ─── HERO ─────────────────────────────────────────────── */}
      <section
        className="rise-in relative overflow-hidden rounded-3xl px-6 py-16 text-center sm:px-10 sm:py-20 lg:min-h-[68vh] lg:px-14"
        style={{
          background: "linear-gradient(135deg, #0f0819 0%, #130d24 100%)",
        }}
      >
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(255,143,132,0.22),transparent_45%)]"
          aria-hidden
        />

        <div className="relative z-10 mx-auto flex max-w-4xl flex-col items-center justify-center lg:min-h-[56vh]">
          <h1 className="text-balance text-4xl leading-tight font-bold text-white sm:text-6xl lg:text-7xl">
            See how your world is connected
          </h1>
          <p className="mt-6 max-w-2xl text-base text-white/70 sm:text-lg">
            Map your relationships, uncover hidden overlaps, and find out how
            many degrees away you really are from anyone.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:gap-4">
            <a
              href={isSignedIn ? "/map" : "#start"}
              className="inline-flex min-w-44 items-center justify-center rounded-full bg-[#ff8f84] px-10 py-4 text-base font-semibold text-white shadow-lg shadow-[#ff8f84]/30 transition hover:-translate-y-0.5 hover:brightness-95"
            >
              Start your network
            </a>
            <a
              href="#demo"
              className="inline-flex min-w-44 items-center justify-center rounded-full border border-white/25 bg-white/5 px-8 py-3 text-base font-semibold text-white/80 backdrop-blur transition hover:-translate-y-0.5 hover:bg-white/12"
            >
              View demo
            </a>
          </div>

          <ul className="mt-4 space-y-2 text-sm text-white/70">
            <li>• Find connection paths</li>
            <li>• See who overlaps in your network</li>
            <li>• Discover hidden relationships</li>
          </ul>

          <p className="mt-6 text-sm text-white/60">
            Curiosity-first. Your connections stay private until both people
            confirm.
          </p>
        </div>
      </section>

      {/* ─── SOCIAL PROOF HOOK ────────────────────────────────── */}
      <section className="text-center">
        <p className="text-xs font-bold uppercase tracking-widest text-(--accent)/70">
          The network effect
        </p>
        <h2 className="mt-3 text-3xl font-semibold sm:text-4xl">
          You’re only 2 connections away
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-base text-black/60 dark:text-white/60">
          Map your world — and watch hidden overlaps appear. Every person you
          add reveals more of the network.
        </p>
        <div className="mt-8 flex justify-center gap-10 sm:gap-16">
          {[
            { stat: "1°", label: "Direct connections" },
            { stat: "2°", label: "Connections of connections" },
            { stat: "3°", label: "Extended network" },
          ].map(({ stat, label }) => (
            <div key={stat} className="text-center">
              <p className="text-4xl font-bold text-(--accent)">{stat}</p>
              <p className="mt-1 text-xs text-black/50 dark:text-white/50">
                {label}
              </p>
            </div>
          ))}
        </div>
        <p className="mx-auto mt-6 max-w-2xl rounded-2xl border border-(--border-soft) bg-white/60 px-5 py-3 text-sm text-black/75 dark:bg-black/20 dark:text-white/80">
          Connections are private until confirmed by both users. Either user can
          remove a connection at any time.
        </p>
      </section>

      {/* ─── MOST CONNECTED ──────────────────────────────────── */}
      <section className="mx-auto max-w-4xl px-6">
        <div className="paper-card overflow-hidden rounded-3xl border border-(--border-soft)">
          <div className="grid gap-0 sm:grid-cols-[1fr_auto]">
            <div className="p-6 sm:p-8">
              <p className="text-xs font-bold uppercase tracking-widest text-(--accent)/70">
                Most connected right now
              </p>
              {mostConnectedPerson ? (
                <>
                  <h2 className="mt-3 text-3xl font-semibold sm:text-4xl">
                    {mostConnectedPerson.user.name}
                  </h2>
                  <p className="mt-2 text-sm text-black/60 dark:text-white/60">
                    @{mostConnectedPerson.user.handle} has the highest count on
                    the public chart.
                  </p>
                </>
              ) : (
                <>
                  <h2 className="mt-3 text-3xl font-semibold sm:text-4xl">
                    No public leader yet
                  </h2>
                  <p className="mt-2 text-sm text-black/60 dark:text-white/60">
                    Confirmed public connections will appear here once the
                    chart has enough data.
                  </p>
                </>
              )}
            </div>
            <div className="flex min-w-48 flex-col justify-center border-t border-(--border-soft) bg-white/50 p-6 text-center dark:bg-black/20 sm:border-t-0 sm:border-l">
              <p className="text-5xl font-bold text-(--accent)">
                {mostConnectedPerson?.connectionCount ?? 0}
              </p>
              <p className="mt-2 text-xs font-semibold uppercase tracking-widest text-black/50 dark:text-white/50">
                Unique connections
              </p>
              <p className="mt-3 text-xs text-black/50 dark:text-white/50">
                {mostConnectedStats.uniqueRelationshipCount} unique chart links
                counted
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── DEMO GRAPH ───────────────────────────────────────── */}
      <section id="demo" className="scroll-mt-24 py-8 sm:py-10">
        <div className="paper-card mx-auto max-w-5xl rounded-3xl p-5 sm:p-7">
          <div className="text-center">
            <h2 className="text-2xl font-semibold sm:text-3xl">
              Peek inside a hidden network
            </h2>
            <p className="mt-2 text-sm text-black/60 dark:text-white/60 sm:text-base">
              Click a node to explore. Relationship labels show the kind of tie
              — dating, exes, situationships, and more.
            </p>
          </div>

          <div className="mt-5 overflow-hidden rounded-2xl border border-black/10 bg-white/45 p-2 shadow-inner dark:border-white/15 dark:bg-black/20 sm:p-3">
            <DemoGraph />
          </div>

          {/* Legend */}
          <div className="mt-5 flex flex-wrap justify-center gap-x-5 gap-y-2">
            {EDGE_LEGEND.map(({ label, color }) => (
              <div key={label} className="flex items-center gap-1.5 text-xs">
                <div
                  className="h-2 w-5 rounded-full"
                  style={{ background: color }}
                />
                <span className="text-black/55 dark:text-white/55">
                  {label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── HOW IT WORKS ────────────────────────────────────── */}
      <section className="mx-auto max-w-3xl px-6">
        <div className="paper-card rounded-2xl p-6 text-center">
          <h3 className="text-lg font-semibold">How it works</h3>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <p className="text-2xl font-bold">1</p>
              <p className="mt-1 text-sm text-black/60 dark:text-white/60">
                Add someone to your map
              </p>
            </div>
            <div>
              <p className="text-2xl font-bold">2</p>
              <p className="mt-1 text-sm text-black/60 dark:text-white/60">
                Connect relationships (dating, ex, talking...)
              </p>
            </div>
            <div>
              <p className="text-2xl font-bold">3</p>
              <p className="mt-1 text-sm text-black/60 dark:text-white/60">
                Discover hidden overlaps and paths
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── FINAL CTA ────────────────────────────────────────── */}
      <section className="rounded-3xl bg-[linear-gradient(90deg,#0f0710,#1b1224)] px-6 py-12 text-center sm:px-10">
        <h2 className="text-3xl font-bold text-white">
          Start mapping your network
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-sm text-white/70">
          Add one person and see where it leads.
        </p>
        <div className="mt-6 flex justify-center">
          <a
            href={isSignedIn ? "/map" : "#start"}
            className="inline-flex items-center justify-center rounded-full bg-[#ff8f84] px-10 py-3.5 text-base font-semibold text-white shadow-lg shadow-[#ff8f84]/30 transition hover:-translate-y-0.5"
          >
            Start your network
          </a>
        </div>
      </section>

      {/* ─── GUEST CHART BUILDER ──────────────────────────────── */}
      {!isSignedIn ? <GuestChartBuilder /> : null}
    </div>
  );
}
