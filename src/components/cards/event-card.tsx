import type { Event } from "@/types/models";

export function EventCard({ event }: { event: Event }) {
  return (
    <article className="paper-card rounded-2xl p-5 transition hover:-translate-y-1">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.12em] uppercase text-[var(--accent)]">
            {event.type}
          </p>
          <h3 className="mt-1 text-xl font-semibold">{event.title}</h3>
          <p className="text-sm text-black/70 dark:text-white/75">{event.date}</p>
        </div>
        <span className="rounded-full border border-[var(--border-soft)] px-3 py-1 text-xs">
          {event.attendees} going
        </span>
      </div>
      <p className="mt-3 text-sm text-black/80 dark:text-white/85">{event.description}</p>
      <p className="mt-2 text-xs text-black/65 dark:text-white/70">{event.location}</p>
      <button
        type="button"
        className="mt-4 rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-95"
      >
        RSVP
      </button>
    </article>
  );
}
