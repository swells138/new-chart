import { EventCard } from "@/components/cards/event-card";
import { SectionHeader } from "@/components/ui/section-header";
import { events } from "@/lib/data";

export default function EventsPage() {
  return (
    <div className="space-y-4">
      <SectionHeader
        title="Upcoming Events"
        subtitle="Fictional gatherings, workshops, and community nights with easy RSVP actions."
      />
      <div className="grid gap-4 md:grid-cols-2">
        {events.map((event) => (
          <EventCard key={event.id} event={event} />
        ))}
      </div>
    </div>
  );
}
