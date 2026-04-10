"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const nextTheme = theme === "dark" ? "light" : "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(nextTheme)}
      className="rounded-full border border-[var(--border-soft)] bg-white/80 p-2 transition hover:-translate-y-0.5 hover:bg-white dark:bg-black/30 dark:hover:bg-black/50"
      aria-label="Toggle dark mode"
      title="Toggle dark mode"
    >
      {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
