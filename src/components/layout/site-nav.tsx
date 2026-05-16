"use client";

import clsx from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { PersonSearch } from "@/components/search/person-search";
import {
  UserButton,
  useUser,
} from "@clerk/nextjs";
import { isModeratorEmailAllowed } from "@/lib/moderation/config";

const PUBLIC_MODERATOR_EMAILS = process.env.NEXT_PUBLIC_MODERATOR_EMAILS ?? null;

function isModeratorEmail(email: string | null | undefined) {
  return isModeratorEmailAllowed(email, PUBLIC_MODERATOR_EMAILS);
}

const links = [
  { href: "/", label: "Home" },
  { href: "/map", label: "Map" },
  { href: "/profile", label: "Profile", requiresAuth: true },
];

export function SiteNav({ clerkEnabled = false }: { clerkEnabled?: boolean }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const hasClerkKeys = clerkEnabled;
  const publicLinks = links.filter((l) => !l.requiresAuth);

  return (
    <header className="sticky top-3 z-40">
      <nav className="paper-card rounded-2xl px-4 py-3 backdrop-blur md:px-6">
        <div className="flex items-center justify-between gap-4">
          <Link href="/" className="group flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent)]/90 text-lg font-bold text-white shadow-sm transition group-hover:rotate-6">
              ML
            </div>
            <div className="min-w-0">
              {/* Customize this brand name/tagline for your own project identity. */}
              <p className="truncate text-base leading-none font-semibold">Meshy Links</p>
              <p className="script truncate text-lg leading-none text-[var(--accent)]">community web</p>
            </div>
          </Link>

          <div className="hidden items-center gap-3 md:flex">
            {hasClerkKeys ? <SignedInPersonSearch /> : null}
            {publicLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={clsx(
                  "rounded-full px-4 py-2 text-sm font-semibold transition",
                  pathname === link.href
                    ? "bg-[var(--accent)] text-white"
                    : "hover:bg-white/70 dark:hover:bg-black/30"
                )}
              >
                {link.label}
              </Link>
            ))}
            {hasClerkKeys && <ClerkDesktopProtectedLinks pathname={pathname} />}
            <ThemeToggle />
            <div className="ml-2 flex items-center gap-2 border-l border-[var(--border-soft)] pl-3">
              <DesktopAuthControls clerkEnabled={hasClerkKeys} />
            </div>
          </div>

          <div className="flex items-center gap-2 md:hidden">
            <ThemeToggle />
            <button
              type="button"
              className="rounded-full border border-[var(--border-soft)] p-2"
              aria-label="Toggle menu"
              onClick={() => setMenuOpen((prev) => !prev)}
            >
              {menuOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>

        {menuOpen && (
          <div className="mt-3 grid gap-2 border-t border-[var(--border-soft)] pt-3 md:hidden">
            {hasClerkKeys ? <SignedInPersonSearch /> : null}
            {publicLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className={clsx(
                  "rounded-xl px-3 py-2 text-sm font-semibold transition",
                  pathname === link.href
                    ? "bg-[var(--accent)] text-white"
                    : "hover:bg-white/70 dark:hover:bg-black/30"
                )}
              >
                {link.label}
              </Link>
            ))}
            {hasClerkKeys && (
              <ClerkMobileProtectedLinks pathname={pathname} onClick={() => setMenuOpen(false)} />
            )}
            <div className="border-t border-[var(--border-soft)] pt-2">
              <MobileAuthControls clerkEnabled={hasClerkKeys} onAction={() => setMenuOpen(false)} />
            </div>
          </div>
        )}
      </nav>
    </header>
  );
}

function SignedInPersonSearch() {
  const { isLoaded, isSignedIn } = useUser();
  if (!isLoaded || !isSignedIn) return null;
  return <PersonSearch />;
}

function ClerkDesktopProtectedLinks({ pathname }: { pathname: string }) {
  const { isLoaded, isSignedIn, user } = useUser();
  if (!isLoaded || !isSignedIn) return null;

  const primaryEmail = user.primaryEmailAddress?.emailAddress;
  const showModeration = isModeratorEmail(primaryEmail);

  const protectedLinks = links
    .filter((link) => link.requiresAuth)
    .map((link) => (
      <Link
        key={link.href}
        href={link.href}
        className={clsx(
          "rounded-full px-4 py-2 text-sm font-semibold transition",
          pathname === link.href
            ? "bg-[var(--accent)] text-white"
            : "hover:bg-white/70 dark:hover:bg-black/30"
        )}
      >
        {link.label}
      </Link>
    ));

  return (
    <>
      {protectedLinks}
      {showModeration ? (
        <Link
          href="/moderation"
          className={clsx(
            "rounded-full px-4 py-2 text-sm font-semibold transition",
            pathname === "/moderation"
              ? "bg-[var(--accent)] text-white"
              : "hover:bg-white/70 dark:hover:bg-black/30"
          )}
        >
          Moderation
        </Link>
      ) : null}
    </>
  );
}

function ClerkMobileProtectedLinks({ pathname, onClick }: { pathname: string; onClick: () => void }) {
  const { isLoaded, isSignedIn, user } = useUser();
  if (!isLoaded || !isSignedIn) return null;

  const primaryEmail = user.primaryEmailAddress?.emailAddress;
  const showModeration = isModeratorEmail(primaryEmail);

  const protectedLinks = links
    .filter((link) => link.requiresAuth)
    .map((link) => (
      <Link
        key={link.href}
        href={link.href}
        onClick={onClick}
        className={clsx(
          "rounded-xl px-3 py-2 text-sm font-semibold transition",
          pathname === link.href
            ? "bg-[var(--accent)] text-white"
            : "hover:bg-white/70 dark:hover:bg-black/30"
        )}
      >
        {link.label}
      </Link>
    ));

  return (
    <>
      {protectedLinks}
      {showModeration ? (
        <Link
          href="/moderation"
          onClick={onClick}
          className={clsx(
            "rounded-xl px-3 py-2 text-sm font-semibold transition",
            pathname === "/moderation"
              ? "bg-[var(--accent)] text-white"
              : "hover:bg-white/70 dark:hover:bg-black/30"
          )}
        >
          Moderation
        </Link>
      ) : null}
    </>
  );
}

function DesktopAuthControls({ clerkEnabled }: { clerkEnabled: boolean }) {
  const hasClerkKeys = clerkEnabled;

  if (!hasClerkKeys) {
    return (
      <>
        <Link
          href="/login"
          className="rounded-full px-4 py-2 text-sm font-semibold transition hover:bg-white/70 dark:hover:bg-black/30"
        >
          Sign in
        </Link>
        <Link
          href="/signup"
          className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-95"
        >
          Join
        </Link>
      </>
    );
  }

  return <ClerkDesktopAuthControls />;
}

function ClerkDesktopAuthControls() {
  const { isLoaded, isSignedIn } = useUser();

  if (!isLoaded) {
    return null;
  }

  return (
    <>
      {!isSignedIn ? (
        <>
        <Link
          href="/login"
          className="rounded-full px-4 py-2 text-sm font-semibold transition hover:bg-white/70 dark:hover:bg-black/30"
        >
          Sign in
        </Link>
        <Link
          href="/signup"
          className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-95"
        >
          Join
        </Link>
        </>
      ) : null}
      {isSignedIn ? (
        <UserButton />
      ) : null}
    </>
  );
}

function MobileAuthControls({
  clerkEnabled,
  onAction,
}: {
  clerkEnabled: boolean;
  onAction: () => void;
}) {
  const hasClerkKeys = clerkEnabled;

  if (!hasClerkKeys) {
    return (
      <>
        <Link
          href="/login"
          onClick={onAction}
          className="block w-full rounded-xl px-3 py-2 text-left text-sm font-semibold transition hover:bg-white/70 dark:hover:bg-black/30"
        >
          Sign in
        </Link>
        <Link
          href="/signup"
          onClick={onAction}
          className="mt-1 block w-full rounded-xl bg-[var(--accent)] px-3 py-2 text-left text-sm font-semibold text-white transition hover:brightness-95"
        >
          Join - create account
        </Link>
      </>
    );
  }

  return <ClerkMobileAuthControls onAction={onAction} />;
}

function ClerkMobileAuthControls({ onAction }: { onAction: () => void }) {
  const { isLoaded, isSignedIn } = useUser();

  if (!isLoaded) {
    return null;
  }

  return (
    <>
      {!isSignedIn ? (
        <>
        <Link
          href="/login"
          onClick={onAction}
          className="block w-full rounded-xl px-3 py-2 text-left text-sm font-semibold transition hover:bg-white/70 dark:hover:bg-black/30"
        >
          Sign in
        </Link>
        <Link
          href="/signup"
          onClick={onAction}
          className="mt-1 block w-full rounded-xl bg-[var(--accent)] px-3 py-2 text-left text-sm font-semibold text-white transition hover:brightness-95"
        >
          Join - create account
        </Link>
        </>
      ) : null}
      {isSignedIn ? (
        <div className="flex items-center gap-3 px-3 py-2">
          <UserButton />
          <span className="text-sm font-semibold">My account</span>
        </div>
      ) : null}
    </>
  );
}
