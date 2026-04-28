import { currentUser } from "@clerk/nextjs/server";

const MODERATOR_EMAILS = new Set(
  (process.env.MODERATOR_EMAILS ?? "sydneywells103@gmail.com")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
);

function normalizeEmail(input: string | null | undefined) {
  return (input ?? "").trim().toLowerCase();
}

export function isAllowedModeratorEmail(email: string | null | undefined) {
  return MODERATOR_EMAILS.has(normalizeEmail(email));
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
