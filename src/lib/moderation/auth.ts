import { currentUser } from "@clerk/nextjs/server";
import { isModeratorEmailAllowed } from "@/lib/moderation/config";

const CONFIGURED_MODERATOR_EMAILS = process.env.MODERATOR_EMAILS ?? null;

export function isAllowedModeratorEmail(email: string | null | undefined) {
  return isModeratorEmailAllowed(email, CONFIGURED_MODERATOR_EMAILS);
}

export async function getCurrentUserPrimaryEmail() {
  const clerk = await currentUser();
  if (!clerk) {
    return null;
  }

  const primary = clerk.primaryEmailAddress?.emailAddress;
  if (primary) {
    return primary;
  }

  return clerk.emailAddresses[0]?.emailAddress ?? null;
}

export async function isCurrentUserModerator() {
  const email = await getCurrentUserPrimaryEmail();
  return isAllowedModeratorEmail(email);
}
