"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

function getSafeRedirectPath(input: string | null) {
  if (!input || !input.startsWith("/")) {
    return "/";
  }

  if (input.startsWith("//")) {
    return "/";
  }

  return input;
}

function AgeCheckContent() {
  const searchParams = useSearchParams();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const redirectTo = useMemo(
    () => getSafeRedirectPath(searchParams.get("redirectTo")),
    [searchParams],
  );
  const confirmAction = `/age-check/confirm?redirectTo=${encodeURIComponent(redirectTo)}`;

  return (
    <section className="mx-auto w-full max-w-xl rounded-2xl border border-[var(--border-soft)] bg-white/75 p-5 shadow-sm dark:bg-black/25 sm:p-6">
      <p className="text-xs font-semibold uppercase tracking-widest text-[var(--accent)]">
        Age verification
      </p>
      <h1 className="mt-2 text-2xl font-semibold">Adults only (18+)</h1>
      <p className="mt-3 text-sm text-black/70 dark:text-white/75">
        You must confirm you are at least 18 years old to continue using this site.
      </p>
      <p className="mt-2 text-xs text-black/60 dark:text-white/65">
        By continuing, you confirm you are 18+ and understand that reported connections can be reviewed.
      </p>

      <div className="mt-5 flex flex-col gap-2 min-[380px]:flex-row min-[380px]:flex-wrap">
        <form action={confirmAction} method="post" onSubmit={() => setIsSubmitting(true)}>
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-75"
          >
            {isSubmitting ? "Verifying..." : "I am 18 or older"}
          </button>
        </form>
        <Link
          href="https://www.google.com"
          className="rounded-full border border-[var(--border-soft)] px-4 py-2 text-center text-sm font-semibold"
        >
          I am under 18
        </Link>
      </div>
    </section>
  );
}

export default function AgeCheckPage() {
  return (
    <Suspense>
      <AgeCheckContent />
    </Suspense>
  );
}
