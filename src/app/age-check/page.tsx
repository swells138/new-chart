"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

const AGE_COOKIE_NAME = "age_verified";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

function getSafeRedirectPath(input: string | null) {
  if (!input || !input.startsWith("/")) {
    return "/";
  }

  if (input.startsWith("//")) {
    return "/";
  }

  return input;
}

export default function AgeCheckPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const redirectTo = useMemo(
    () => getSafeRedirectPath(searchParams.get("redirectTo")),
    [searchParams],
  );

  function confirmAge() {
    document.cookie = `${AGE_COOKIE_NAME}=true; path=/; max-age=${ONE_YEAR_SECONDS}; SameSite=Lax`;
    router.replace(redirectTo);
  }

  return (
    <section className="mx-auto max-w-xl rounded-2xl border border-[var(--border-soft)] bg-white/75 p-6 shadow-sm dark:bg-black/25">
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

      <div className="mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={confirmAge}
          className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white"
        >
          I am 18 or older
        </button>
        <Link
          href="https://www.google.com"
          className="rounded-full border border-[var(--border-soft)] px-4 py-2 text-sm font-semibold"
        >
          I am under 18
        </Link>
      </div>
    </section>
  );
}
