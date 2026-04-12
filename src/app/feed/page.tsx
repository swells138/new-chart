import { auth } from "@clerk/nextjs/server";
import { MemberCard } from "@/components/cards/member-card";
import { SectionHeader } from "@/components/ui/section-header";
import { prisma } from "@/lib/prisma";
import { getAllUsers, getApprovedConnectionUserIds } from "@/lib/prisma-queries";

export const dynamic = "force-dynamic";

const pendingTypePrefix = "pending::";

const connectionLabels: Record<string, string> = {
  friends: "became friends",
  married: "got married",
  exes: "are exes",
  collaborators: "started collaborating",
  roommates: "became roommates",
  crushes: "have a crush on each other",
  mentors: "connected as mentor & mentee",
};

export default async function FeedPage() {
  let currentUserDbId: string | null = null;

  const { userId } = await auth();
  if (userId) {
    const user = await prisma.user.findUnique({
      where: { clerkId: userId },
      select: { id: true },
    });
    if (user) currentUserDbId = user.id;
  }

  const [users, connections] = await Promise.all([
    getAllUsers(),
    prisma.relationship.findMany({
      where: { NOT: { type: { startsWith: pendingTypePrefix } } },
      select: {
        id: true,
        type: true,
        note: true,
        user1Id: true,
        user2Id: true,
        user1: { select: { id: true, name: true, handle: true } },
        user2: { select: { id: true, name: true, handle: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const connectedIds = currentUserDbId ? await getApprovedConnectionUserIds(currentUserDbId) : [];
  const connectedSet = new Set(connectedIds);

  const featuredUsers = [...users].sort((a, b) => {
    const aConn = connectedSet.has(a.id) ? 1 : 0;
    const bConn = connectedSet.has(b.id) ? 1 : 0;
    if (aConn !== bConn) return bConn - aConn;
    return Number(b.featured) - Number(a.featured);
  });

  return (
    <div className="grid gap-4 lg:grid-cols-[1.4fr_0.8fr]">
      <section className="space-y-4">
        <SectionHeader
          title="Community Feed"
          subtitle="New connections forming across the community."
        />
        {connections.length === 0 && (
          <p className="text-sm text-black/60 dark:text-white/70">No connections yet.</p>
        )}
        {connections.map((conn) => {
          const label = connectionLabels[conn.type] ?? "connected";
          const isYourConnection =
            currentUserDbId &&
            (conn.user1Id === currentUserDbId || conn.user2Id === currentUserDbId);

          return (
            <article
              key={conn.id}
              className="paper-card rounded-2xl p-5 transition hover:-translate-y-0.5"
            >
              <div className="flex items-center gap-3">
                <div className="flex -space-x-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--accent)]/20 text-sm font-bold ring-2 ring-white dark:ring-black">
                    {(conn.user1.name ?? "?").charAt(0)}
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--accent)]/40 text-sm font-bold ring-2 ring-white dark:ring-black">
                    {(conn.user2.name ?? "?").charAt(0)}
                  </div>
                </div>
                <div>
                  <p className="text-sm font-semibold">
                    {conn.user1.name ?? conn.user1.handle}{" "}
                    <span className="font-normal text-black/60 dark:text-white/65">&amp;</span>{" "}
                    {conn.user2.name ?? conn.user2.handle}
                  </p>
                  <p className="text-xs text-black/60 dark:text-white/65">
                    {label}
                    {isYourConnection && (
                      <span className="ml-2 rounded-full bg-[var(--accent)]/15 px-2 py-0.5 text-[10px] font-semibold text-[var(--accent)]">
                        your connection
                      </span>
                    )}
                  </p>
                </div>
              </div>
              {conn.note ? (
                <p className="mt-3 text-sm text-black/75 dark:text-white/80 italic">"{conn.note}"</p>
              ) : null}
            </article>
          );
        })}
      </section>

      <aside className="space-y-4">
        <div className="space-y-3">
          <h3 className="text-lg font-semibold">Featured Members</h3>
          {featuredUsers.slice(0, 5).map((user) => (
            <MemberCard key={user.id} user={user} />
          ))}
        </div>
      </aside>
    </div>
  );
}
