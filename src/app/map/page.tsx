import { RelationshipMap } from "@/components/map/relationship-map";
import { SectionHeader } from "@/components/ui/section-header";
import { relationships, users } from "@/lib/data";

export default function MapPage() {
  return (
    <div className="space-y-4">
      <SectionHeader
        title="Relationship Map"
        subtitle="Click nodes to open member details and toggle relationship filters to reshape the graph."
      />
      <RelationshipMap users={users} relationships={relationships} />
    </div>
  );
}
