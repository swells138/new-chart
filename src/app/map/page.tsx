import { RelationshipMap } from "@/components/map/relationship-map";
import { SectionHeader } from "@/components/ui/section-header";
import { getAllRelationships, getAllUsers } from "@/lib/prisma-queries";

export const dynamic = "force-dynamic";

export default async function MapPage() {
  const [users, relationships] = await Promise.all([getAllUsers(), getAllRelationships()]);

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
