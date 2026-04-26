import { redirect } from "next/navigation";
import { SectionHeader } from "@/components/ui/section-header";
import { ModerationPanel } from "@/components/moderation/moderation-panel";
import { isCurrentUserModerator } from "@/lib/moderation/auth";
import { listModerationReports, listUserLocks } from "@/lib/moderation/reports";

export const dynamic = "force-dynamic";

export default async function ModerationPage() {
  const allowed = await isCurrentUserModerator();
  if (!allowed) {
    redirect("/");
  }

  const [reports, locks] = await Promise.all([
    listModerationReports(300),
    listUserLocks(300),
  ]);

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Moderation"
        subtitle="Private moderation area for reviewing reported nodes and tracking decisions."
      />
      <ModerationPanel initialReports={reports} initialLocks={locks} />
    </div>
  );
}
