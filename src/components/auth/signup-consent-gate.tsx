"use client";

import Link from "next/link";
import { SignUp } from "@clerk/nextjs";
import { useState } from "react";

export function SignupConsentGate() {
  const [agreed, setAgreed] = useState(false);

  return (
    <div className="mx-auto w-full max-w-md space-y-4">
      <div className="rounded-2xl border border-[var(--border-soft)] bg-white/70 p-4 text-sm dark:bg-black/20">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(event) => setAgreed(event.target.checked)}
            className="mt-1 h-4 w-4"
            required
          />
          <span className="leading-relaxed text-black/80 dark:text-white/85">
            I agree to the{" "}
            <Link href="/terms" className="font-semibold text-[var(--accent)] underline">
              Terms of Service
            </Link>{" "}
            and confirm I am 18 years or older.
          </span>
        </label>
      </div>

      {!agreed ? (
        <p className="text-xs text-black/65 dark:text-white/70">
          Please check the box above to continue.
        </p>
      ) : null}

      {agreed ? (
        <div className="flex justify-center py-2">
          <SignUp path="/signup" routing="path" fallbackRedirectUrl="/profile" />
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-[var(--border-soft)] p-6 text-center text-sm text-black/65 dark:text-white/70">
          Signup form will unlock after consent.
        </div>
      )}
    </div>
  );
}
