import { MemberDirectory } from "@/components/members/member-directory";
import { SectionHeader } from "@/components/ui/section-header";
import { demoRelationships, demoUsers } from "@/lib/demo-data";
import { getMemberDirectoryData } from "@/lib/prisma-queries";
import type { Post } from "@/types/models";

export const dynamic = "force-dynamic";

const demoPosts: Post[] = [
  {
    id: "demo-post-1",
    userId: "demo-user-mara",
    content: "Hosted a small dinner and found three unexpected overlaps.",
    timestamp: "1h ago",
    tags: ["events", "connections"],
    likes: 12,
    comments: 3,
  },
  {
    id: "demo-post-2",
    userId: "demo-user-rey",
    content: "The private chart helped me remember who still needs an invite.",
    timestamp: "3h ago",
    tags: ["private chart"],
    likes: 8,
    comments: 1,
  },
  {
    id: "demo-post-3",
    userId: "demo-user-dani",
    content: "Consent-first confirmations make this feel much less messy.",
    timestamp: "1d ago",
    tags: ["verification"],
    likes: 18,
    comments: 5,
  },
];

export default async function MembersPage() {
  let users = demoUsers;
  let relationships = demoRelationships;
  let posts = demoPosts;

  try {
    const data = await getMemberDirectoryData();
    if (data.users.length > 0) {
      users = data.users;
      relationships = data.relationships;
      posts = data.posts.length > 0 ? data.posts : demoPosts;
    }
  } catch (error) {
    console.error("Members page failed to load directory data", error);
  }

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Members"
        subtitle="Browse demo users, public cards, and visible network context."
      />
      <MemberDirectory users={users} posts={posts} relationships={relationships} />
    </div>
  );
}
