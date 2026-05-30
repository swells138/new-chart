export const DEMO_USER_ID = "demo-user-sydney";
export const DEMO_CLERK_ID = "demo_clerk_email_only";

export function isDemoModeEnabled() {
  return process.env.NEXT_PUBLIC_DEMO_MODE !== "false";
}

export function isDemoUserId(userId: string | null | undefined) {
  return userId === DEMO_USER_ID || userId === DEMO_CLERK_ID;
}
