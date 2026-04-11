import { auth } from "@clerk/nextjs/server";
import { Avatar } from "@/components/ui/avatar";
import { SectionHeader } from "@/components/ui/section-header";
import { prisma } from "@/lib/prisma";
import { getApprovedConnectionUserIds } from "@/lib/prisma-queries";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

const hasClerkKeys =
  Boolean(process.env.CLERK_SECRET_KEY) &&
  Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

const threads = [
  {
    id: "t1",
    name: "Mara Sol",
    preview: "Can we add your photos to the event recap?",
    time: "11m",
    unread: true,
  },
  {
    id: "t2",
    name: "Rey Navarro",
    preview: "Poetry prompt draft is up in shared notes.",
    time: "1h",
    unread: false,
  },
  {
    id: "t3",
    name: "Dani Park",
    preview: "Need one more volunteer for setup at 6.",
    time: "3h",
    unread: true,
  },
];

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function renderNotificationContent(content: string): ReactNode {
  const linkPattern = /(^|\s)(\/map(?:\S*)?)/g;
  const result: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null = linkPattern.exec(content);

  while (match) {
    const fullMatch = match[0];
    const href = match[2];
    const hrefStart = match.index + fullMatch.indexOf(href);

    if (lastIndex < hrefStart) {
      result.push(content.slice(lastIndex, hrefStart));
    }

    result.push(
      <a
        key={`${href}-${hrefStart}`}
        href={href}
        className="underline decoration-[var(--accent)] underline-offset-2 hover:opacity-80"
      >
        {href}
      </a>
    );

    lastIndex = hrefStart + href.length;
    match = linkPattern.exec(content);
  }

  if (lastIndex < content.length) {
    result.push(content.slice(lastIndex));
  }

  return result.length > 0 ? result : content;
}

export default async function InboxPage() {
  let connectedSet = new Set<string>();
  let dbNotifications: { id: string; content: string; read: boolean; createdAt: Date; senderName: string | null }[] = [];

  if (hasClerkKeys) {
    const { userId } = await auth();

    if (userId) {
      const dbUser = await prisma.user.findUnique({
        where: { clerkId: userId },
        select: { id: true },
      });

      if (dbUser) {
        const connectedIds = await getApprovedConnectionUserIds(dbUser.id);
        connectedSet = new Set(connectedIds);

        const messages = await prisma.message.findMany({
          where: { recipientId: dbUser.id },
          orderBy: { createdAt: "desc" },
          take: 50,
          include: {
            sender: { select: { name: true } },
          },
        });

        dbNotifications = messages.map((m) => ({
          id: m.id,
          content: m.content,
          read: m.read,
          createdAt: m.createdAt,
          senderName: m.sender.name,
        }));

        dbNotifications.sort((a, b) => {
          const senderA = messages.find((m) => m.id === a.id)?.senderId;
          const senderB = messages.find((m) => m.id === b.id)?.senderId;
          const aConnected = senderA && connectedSet.has(senderA) ? 1 : 0;
          const bConnected = senderB && connectedSet.has(senderB) ? 1 : 0;
          if (aConnected !== bConnected) {
            return bConnected - aConnected;
          }
          return b.createdAt.getTime() - a.createdAt.getTime();
        });
      }
    }
  }

  const dynamicThreads = dbNotifications.slice(0, 3).map((n) => ({
    id: n.id,
    name: n.senderName ?? "Unknown member",
    preview: n.content,
    time: timeAgo(n.createdAt),
    unread: !n.read,
  }));

  const displayedThreads = dynamicThreads.length > 0 ? dynamicThreads : threads;

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Messages + Notifications"
        subtitle="A polished interface preview for private threads and activity alerts."
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_0.8fr]">
        <section className="paper-card rounded-2xl p-5">
          <h3 className="text-lg font-semibold">Recent Threads</h3>
          <div className="mt-3 space-y-2">
            {displayedThreads.map((thread) => (
              <button
                type="button"
                key={thread.id}
                className="flex w-full items-center justify-between rounded-xl border border-[var(--border-soft)] p-3 text-left transition hover:bg-white/80 dark:hover:bg-black/20"
              >
                <div className="flex items-center gap-3">
                  <Avatar name={thread.name} className="h-10 w-10 text-xs" />
                  <div>
                    <p className="font-semibold">{thread.name}</p>
                    <p className="text-sm text-black/70 dark:text-white/75">{thread.preview}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-black/65 dark:text-white/75">{thread.time}</p>
                  {thread.unread ? (
                    <span className="mt-1 inline-block rounded-full bg-[var(--accent)] px-2 py-0.5 text-[10px] text-white">
                      new
                    </span>
                  ) : null}
                </div>
              </button>
            ))}
          </div>
        </section>

        <aside className="paper-card rounded-2xl p-5">
          <h3 className="text-lg font-semibold">Notifications</h3>
          {dbNotifications.length > 0 ? (
            <ul className="mt-3 space-y-2 text-sm">
              {dbNotifications.map((n) => (
                <li
                  key={n.id}
                  className="rounded-xl border border-[var(--border-soft)] p-3 flex items-start justify-between gap-2"
                >
                  <span className="flex-1">
                    {n.senderName ? (
                      <span className="font-medium">{n.senderName}: </span>
                    ) : null}
                    {renderNotificationContent(n.content)}
                  </span>
                  <span className="shrink-0 text-xs text-black/50 dark:text-white/50">
                    {timeAgo(n.createdAt)}
                  </span>
                  {!n.read ? (
                    <span className="shrink-0 inline-block rounded-full bg-[var(--accent)] px-2 py-0.5 text-[10px] text-white leading-none self-center">
                      new
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-black/50 dark:text-white/50">No notifications yet.</p>
          )}
        </aside>
      </div>
    </div>
  );
}

