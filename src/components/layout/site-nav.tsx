"use client";

import clsx from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { ThemeToggle } from "@/components/theme/theme-toggle";

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
              SB
            </div>
            <div>
              {/* Customize this brand name/tagline for your own project identity. */}
              <p className="text-base leading-none font-semibold">Signal Bloom</p>
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
          </div>
        )}
      </nav>
    </header>
  );
}
