import { MemberDirectory } from "@/components/members/member-directory";
import { SectionHeader } from "@/components/ui/section-header";
import { posts as fallbackPosts, relationships as fallbackRelationships, users as fallbackUsers } from "@/lib/data";
import { getMemberDirectoryData } from "@/lib/prisma-queries";

export default async function MembersPage() {
  let users = fallbackUsers;
  let posts = fallbackPosts;
  let relationships = fallbackRelationships;

  try {
    const data = await getMemberDirectoryData();

    if (data.users.length > 0) {
      users = data.users;
      posts = data.posts;
      relationships = data.relationships;
    }
  } catch (error) {
    console.error("Falling back to static member data:", error);
  }

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
