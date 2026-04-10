"use client";

import clsx from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import {
  SignInButton,
  SignUpButton,
  UserButton,
  useUser,
} from "@clerk/nextjs";

const links = [
  { href: "/", label: "Home" },
  { href: "/feed", label: "Feed" },
  { href: "/members", label: "Members" },
  { href: "/map", label: "Map" },
  { href: "/articles", label: "Articles" },
  { href: "/events", label: "Events" },
  { href: "/inbox", label: "Inbox" },
];

export function SiteNav() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-3 z-40">
      <nav className="paper-card rounded-2xl px-4 py-3 backdrop-blur md:px-6">
        <div className="flex items-center justify-between gap-4">
          <Link href="/" className="group flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent)]/90 text-lg font-bold text-white shadow-sm transition group-hover:rotate-6">
              ML
            </div>
            <div>
              {/* Customize this brand name/tagline for your own project identity. */}
              <p className="text-base leading-none font-semibold">Meshy Links</p>
              <p className="script text-lg leading-none text-[var(--accent)]">community web</p>
            </div>
          </Link>

          <div className="hidden items-center gap-1 md:flex">
            {links.map((link) => (
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
            <ThemeToggle />
            <div className="ml-2 flex items-center gap-2 border-l border-[var(--border-soft)] pl-3">
              <DesktopAuthControls />
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
            {links.map((link) => (
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
            <div className="border-t border-[var(--border-soft)] pt-2">
              <MobileAuthControls onAction={() => setMenuOpen(false)} />
            </div>
          </div>
        )}
      </nav>
    </header>
  );
}

function DesktopAuthControls() {
  const hasClerkKeys = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

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
  const { isSignedIn } = useUser();

  if (!isSignedIn) {
    return (
      <>
        <SignInButton>
          <button className="rounded-full px-4 py-2 text-sm font-semibold transition hover:bg-white/70 dark:hover:bg-black/30">
            Sign in
          </button>
        </SignInButton>
        <SignUpButton>
          <button className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-95">
            Join
          </button>
        </SignUpButton>
      </>
    );
  }

  return <UserButton />;
}

function MobileAuthControls({ onAction }: { onAction: () => void }) {
  const hasClerkKeys = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

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
  const { isSignedIn } = useUser();

  if (!isSignedIn) {
    return (
      <>
        <SignInButton>
          <button
            onClick={onAction}
            className="block w-full rounded-xl px-3 py-2 text-left text-sm font-semibold transition hover:bg-white/70 dark:hover:bg-black/30"
          >
            Sign in
          </button>
        </SignInButton>
        <SignUpButton>
          <button
            onClick={onAction}
            className="mt-1 block w-full rounded-xl bg-[var(--accent)] px-3 py-2 text-left text-sm font-semibold text-white transition hover:brightness-95"
          >
            Join - create account
          </button>
        </SignUpButton>
      </>
    );
  }

  return (
    <div className="flex items-center gap-3 px-3 py-2">
      <UserButton />
      <span className="text-sm font-semibold">My account</span>
    </div>
  );
}
