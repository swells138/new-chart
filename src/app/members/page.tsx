import { MemberDirectory } from "@/components/members/member-directory";
import { SectionHeader } from "@/components/ui/section-header";
import { posts, relationships, users } from "@/lib/data";

export default function MembersPage() {
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
