import { getUserLock } from "@/lib/moderation/reports";

export async function getActiveUserLockMessage(userId: string) {
  const lock = await getUserLock(userId);
  if (!lock) {
    return null;
  }

  const until = lock.lockedUntil.toISOString();
  return lock.reason
    ? `Your account is temporarily locked from creating or editing connections until ${until}. Reason: ${lock.reason}`
    : `Your account is temporarily locked from creating or editing connections until ${until}.`;
}
