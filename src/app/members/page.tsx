import { MemberDirectory } from "@/components/members/member-directory";
import { SectionHeader } from "@/components/ui/section-header";
import { getMemberDirectoryData } from "@/lib/prisma-queries";

export const dynamic = "force-dynamic";

export default async function MembersPage() {
  const { users, posts, relationships } = await getMemberDirectoryData();

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Member Profiles"
        subtitle="Search people, browse profile details, and see their latest posts and connections."
      />
      <MemberDirectory users={users} posts={posts} relationships={relationships} />
    </div>
  );
}
