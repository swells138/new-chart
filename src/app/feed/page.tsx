import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { SectionHeader } from "@/components/ui/section-header";
import { demoUsers } from "@/lib/demo-data";

export const dynamic = "force-dynamic";

const feedItems = [
  {
    id: "feed-1",
    userId: "demo-user-mara",
    title: "Mara added a private invite",
    body: "Ivy Morgan is waiting for one-time invite verification.",
    href: "/map?chart=private&focus=manage",
  },
  {
    id: "feed-2",
    userId: "demo-user-rey",
    title: "Rey confirmed a public connection",
    body: "The extended chart now reveals a second-degree path through Lena.",
    href: "/map?targetUserId=demo-user-lena",
  },
  {
    id: "feed-3",
    userId: "demo-user-dani",
    title: "Dani updated their card",
    body: "New location and relationship context are visible in Members.",
    href: "/members",
  },
];

export default function FeedPage() {
  return (
    <div className="space-y-4">
      <SectionHeader
        title="Feed"
        subtitle="A demo activity feed reviewers can browse without signing in."
      />
      <section className="grid gap-3">
        {feedItems.map((item) => {
          const user = demoUsers.find((candidate) => candidate.id === item.userId);
          return (
            <Link
              key={item.id}
              href={item.href}
              className="paper-card flex items-start gap-3 rounded-2xl p-4 transition hover:-translate-y-0.5 hover:shadow-lg"
            >
              <Avatar name={user?.name ?? "Member"} className="h-11 w-11 text-xs" />
              <div>
                <h3 className="font-semibold">{item.title}</h3>
                <p className="mt-1 text-sm text-black/68 dark:text-white/70">
                  {item.body}
                </p>
                <p className="mt-2 text-xs font-semibold text-[var(--accent)]">
                  Open
                </p>
              </div>
            </Link>
          );
        })}
      </section>
    </div>
  );
}
