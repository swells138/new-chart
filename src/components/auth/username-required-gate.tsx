"use client";

import { useUser } from "@clerk/nextjs";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type UsernameState =
  | { status: "idle" }
  | { status: "ready"; hasUsername: boolean; pathname: string; userId: string };

export function UsernameRequiredGate({
  clerkEnabled,
}: {
  clerkEnabled: boolean;
}) {
  if (!clerkEnabled) {
    return null;
  }

  return <ClerkUsernameRequiredGate />;
}

function ClerkUsernameRequiredGate() {
  const pathname = usePathname();
  const router = useRouter();
  const { isLoaded, isSignedIn, user } = useUser();
  const [usernameState, setUsernameState] = useState<UsernameState>({
    status: "idle",
  });

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !user?.id) {
      return;
    }

    let cancelled = false;
    const userId = user.id;

    async function checkUsername() {
      try {
        const response = await fetch("/api/profile", {
          cache: "no-store",
          headers: { Accept: "application/json" },
        });

        if (!response.ok) {
          if (!cancelled) {
            setUsernameState({ status: "idle" });
          }
          return;
        }

        const body = (await response.json()) as {
          profile?: { handle?: string | null };
        };

        if (!cancelled) {
          setUsernameState({
            status: "ready",
            hasUsername: Boolean(body.profile?.handle?.trim()),
            pathname,
            userId,
          });
        }
      } catch {
        if (!cancelled) {
          setUsernameState({ status: "idle" });
        }
      }
    }

    void checkUsername();

    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, pathname, user?.id]);

  useEffect(() => {
    if (
      usernameState.status !== "ready" ||
      !isLoaded ||
      !isSignedIn ||
      usernameState.hasUsername ||
      usernameState.pathname !== pathname ||
      pathname === "/profile" ||
      pathname.startsWith("/login") ||
      pathname.startsWith("/signup")
    ) {
      return;
    }

    router.replace("/profile");
  }, [isLoaded, isSignedIn, pathname, router, usernameState]);

  return null;
}
