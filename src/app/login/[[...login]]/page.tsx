import { Suspense } from "react";
import { LoginRedirectGate } from "@/components/auth/login-redirect-gate";

const hasClerkKeys =
  Boolean(process.env.CLERK_SECRET_KEY) &&
  Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

export default function LoginPage() {
  if (!hasClerkKeys) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-[var(--border-soft)] bg-white/70 p-6 text-sm dark:bg-black/20">
        Auth is not configured yet. Add Clerk environment variables in your deployment settings to enable login.
      </div>
    );
  }

  return (
    <div className="flex justify-center py-8">
      <Suspense>
        <LoginRedirectGate />
      </Suspense>
    </div>
  );
}
