import { SectionHeader } from "@/components/ui/section-header";

export const dynamic = "force-dynamic";

export default function FeedPage() {
  return (
    <div className="space-y-4">
      <SectionHeader
        title="Feed"
        subtitle="Recent public activity will appear here."
      />
      <section className="paper-card rounded-2xl p-5">
        <p className="text-sm text-black/60 dark:text-white/65">
          No recent activity yet.
        </p>
      </section>
    </div>
  );
}
