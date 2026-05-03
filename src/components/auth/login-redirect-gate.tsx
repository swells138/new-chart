"use client";

import { SignIn } from "@clerk/nextjs";
import { useMemo } from "react";
import { useSearchParams } from "next/navigation";

function getSafeRedirectPath(input: string | null) {
  if (!input || !input.startsWith("/") || input.startsWith("//")) {
    return null;
  }

  return input;
}

export function LoginRedirectGate() {
  const searchParams = useSearchParams();
  const redirectUrl = useMemo(
    () =>
      getSafeRedirectPath(
        searchParams.get("redirect_url") ?? searchParams.get("redirect"),
      ),
    [searchParams],
  );
  const signUpUrl = redirectUrl
    ? `/signup?redirect_url=${encodeURIComponent(redirectUrl)}`
    : "/signup";

  return (
    <SignIn
      path="/login"
      routing="path"
      forceRedirectUrl={redirectUrl}
      fallbackRedirectUrl="/map"
      signUpUrl={signUpUrl}
      withSignUp
    />
  );
}
