import { Avatar } from "@/components/ui/avatar";
import { SectionHeader } from "@/components/ui/section-header";

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

const notifications = [
  "Ivy mentioned you in a post about film props.",
  "New RSVP on Open Air Film Picnic.",
  "Your article draft has 4 new comments.",
  "Noa requested to connect as collaborator.",
];

export default function InboxPage() {
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
            {threads.map((thread) => (
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
          <ul className="mt-3 space-y-2 text-sm">
            {notifications.map((note) => (
              <li key={note} className="rounded-xl border border-[var(--border-soft)] p-3">
                {note}
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  );
}
