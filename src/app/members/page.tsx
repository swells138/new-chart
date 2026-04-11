import { auth } from "@clerk/nextjs/server";
import { MemberDirectory } from "@/components/members/member-directory";
import { SectionHeader } from "@/components/ui/section-header";
import { prisma } from "@/lib/prisma";
import { getApprovedConnectionUserIds, getMemberDirectoryData } from "@/lib/prisma-queries";

export const dynamic = "force-dynamic";

const hasClerkKeys =
  Boolean(process.env.CLERK_SECRET_KEY) &&
  Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

export default async function MembersPage() {
  let currentUserDbId: string | null = null;

  if (hasClerkKeys) {
    const { userId } = await auth();
    if (userId) {
      const user = await prisma.user.findUnique({
        where: { clerkId: userId },
        select: { id: true },
      });
      currentUserDbId = user?.id ?? null;
    }
  }

  const { users, posts, relationships } = await getMemberDirectoryData();
  const connectedIds = currentUserDbId ? await getApprovedConnectionUserIds(currentUserDbId) : [];
  const connectedSet = new Set(connectedIds);

  const usersOrdered = [...users].sort((a, b) => {
    const aConnected = connectedSet.has(a.id) ? 1 : 0;
    const bConnected = connectedSet.has(b.id) ? 1 : 0;
    if (aConnected !== bConnected) {
      return bConnected - aConnected;
    }
    return a.name.localeCompare(b.name);
  });

  const postsOrdered = [...posts].sort((a, b) => {
    const aConnected = connectedSet.has(a.userId) ? 1 : 0;
    const bConnected = connectedSet.has(b.userId) ? 1 : 0;
    if (aConnected !== bConnected) {
      return bConnected - aConnected;
    }
    return 0;
  });

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Member Profiles"
        subtitle="Search people, browse profile details, and see their latest posts and connections."
      />
      <MemberDirectory users={usersOrdered} posts={postsOrdered} relationships={relationships} />
    </div>
  );
}
