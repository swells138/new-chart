import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { ClaimConnectionsPanel } from "@/components/profile/claim-connections-panel";
import { SectionHeader } from "@/components/ui/section-header";
import { getClaimCandidatesForUser } from "@/lib/network-claims";
import { prisma } from "@/lib/prisma";

const hasClerkKeys =
  Boolean(process.env.CLERK_SECRET_KEY) &&
  Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

async function getOrCreateCurrentDbUserId(clerkId: string) {
  const existing = await prisma.user.findUnique({
    where: { clerkId },
    select: { id: true },
  });

  if (existing) {
    return existing.id;
  }

  const clerk = await currentUser();
  const fullName = [clerk?.firstName, clerk?.lastName].filter(Boolean).join(" ").trim();
  const email = clerk?.emailAddresses?.[0]?.emailAddress;
  const phoneNumber = clerk?.phoneNumbers?.[0]?.phoneNumber;

  const created = await prisma.user.create({
    data: {
      clerkId,
      name: fullName || clerk?.username || "New member",
      email,
      phoneNumber,
      handle: clerk?.username || null,
    },
    select: { id: true },
  });

  return created.id;
}

export default async function ClaimConnectionsPage() {
  if (!hasClerkKeys) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-[var(--border-soft)] bg-white/70 p-6 text-sm dark:bg-black/20">
        Auth is not configured yet. Add Clerk environment variables to enable connection claiming.
      </div>
    );
  }

  const { userId } = await auth();
  if (!userId) {
    redirect("/login");
  }

  const currentUserId = await getOrCreateCurrentDbUserId(userId);
  const candidates = await getClaimCandidatesForUser(currentUserId, {
    includeDismissed: false,
    limit: 5,
  });

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Are any of these you?"
        subtitle="Confirm a placeholder node to pull its pending connections into your account for review."
      />
      <ClaimConnectionsPanel initialCandidates={candidates} mode="signup" />
    </div>
  );
}