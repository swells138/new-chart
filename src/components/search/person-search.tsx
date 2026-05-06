"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { users } from "@/lib/data";

const MAX_RESULTS = 6;

export function PersonSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");

  const trimmedQuery = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (!trimmedQuery) return [];

    return users
      .filter((user) => user.name.toLowerCase().includes(trimmedQuery))
      .slice(0, MAX_RESULTS);
  }, [trimmedQuery]);

  function selectUser(targetUserId: string) {
    window.sessionStorage.setItem("targetUserId", targetUserId);
    setQuery("");
    router.push(`/map?targetUserId=${encodeURIComponent(targetUserId)}`);
  }

  return (
    <div className="relative w-full md:max-w-xs">
      <label htmlFor="person-search" className="sr-only">
        Search for a person
      </label>
      <div className="relative">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-black/45 dark:text-white/50"
        />
        <input
          id="person-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search for a person..."
          autoComplete="off"
          className="w-full rounded-full border border-[var(--border-soft)] bg-white/80 py-2 pr-4 pl-9 text-sm font-semibold outline-none transition placeholder:text-black/45 focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20 dark:bg-black/25 dark:placeholder:text-white/45"
        />
      </div>

      {trimmedQuery ? (
        <div className="absolute top-full right-0 left-0 z-50 mt-2 overflow-hidden rounded-xl border border-[var(--border-soft)] bg-[var(--card)] shadow-lg">
          {results.length > 0 ? (
            <ul role="listbox" aria-label="Search results">
              {results.map((user) => (
                <li key={user.id}>
                  <button
                    type="button"
                    onClick={() => selectUser(user.id)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-black/5 focus:bg-black/5 focus:outline-none dark:hover:bg-white/10 dark:focus:bg-white/10"
                  >
                    <span>
                      <span className="block text-sm font-bold">{user.name}</span>
                      <span className="block text-xs text-black/60 dark:text-white/65">
                        @{user.handle}
                      </span>
                    </span>
                    <span className="text-xs font-semibold text-black/45 dark:text-white/45">
                      {user.location}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-3 text-sm font-semibold text-black/60 dark:text-white/65">
              No people found
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
