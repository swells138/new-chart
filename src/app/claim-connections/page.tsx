import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { ClaimConnectionsPanel } from "@/components/profile/claim-connections-panel";
import { ConfirmClaimsPanel } from "@/components/profile/confirm-claims-panel";
import { SectionHeader } from "@/components/ui/section-header";
import { ensureDbUserIdByClerkId } from "@/lib/db-user-bootstrap";
import { getClaimCandidatesForUser, getPendingCreatorConfirmations } from "@/lib/network-claims";

export const dynamic = "force-dynamic";

const hasClerkKeys =
  Boolean(process.env.CLERK_SECRET_KEY) &&
  Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ||
      process.env.CLERK_PUBLISHABLE_KEY
  );

function getClerkNameCandidates(clerkUser: Awaited<ReturnType<typeof currentUser>>) {
  if (!clerkUser) {
    return [];
  }

  return [
    [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" "),
    clerkUser.fullName,
    clerkUser.username,
    clerkUser.firstName,
    clerkUser.lastName,
  ].filter((name): name is string => Boolean(name?.trim()));
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

  // Get the user's actual name from Clerk
  const clerkUser = await currentUser();
  const clerkNameCandidates = getClerkNameCandidates(clerkUser);
  const fullName =
    clerkNameCandidates[0] ||
    clerkUser?.username ||
    clerkUser?.firstName ||
    "New member";

  const currentUserId = await ensureDbUserIdByClerkId(userId, fullName);
  const [candidates, pendingConfirmations] = await Promise.all([
    getClaimCandidatesForUser(currentUserId, {
      alternateNames: clerkNameCandidates,
      includeDismissed: false,
      limit: 5,
    }),
    getPendingCreatorConfirmations(currentUserId),
  ]);

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Are any of these you?"
        subtitle="Confirm a placeholder node to pull its pending connections into your account for review."
      />
      {pendingConfirmations.length > 0 ? (
        <ConfirmClaimsPanel
          initialConfirmations={pendingConfirmations}
          currentUserId={currentUserId}
        />
      ) : null}
      <ClaimConnectionsPanel initialCandidates={candidates} mode="signup" />
    </div>
  );
}
