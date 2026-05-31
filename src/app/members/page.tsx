import { MemberDirectory } from "@/components/members/member-directory";
import { SectionHeader } from "@/components/ui/section-header";
import { getMemberDirectoryData } from "@/lib/prisma-queries";
import type { Post, Relationship, User } from "@/types/models";

export const dynamic = "force-dynamic";

export default async function MembersPage() {
  let users: User[] = [];
  let relationships: Relationship[] = [];
  let posts: Post[] = [];

  try {
    const data = await getMemberDirectoryData();
    users = data.users;
    relationships = data.relationships;
    posts = data.posts;
  } catch (error) {
    console.error("Members page failed to load directory data", error);
  }

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Members"
        subtitle="Browse public cards and visible network context."
      />
      <MemberDirectory users={users} posts={posts} relationships={relationships} />
    </div>
  );
}
