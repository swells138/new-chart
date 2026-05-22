"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface PersonSearchResult {
  id: string;
  name: string;
  handle: string;
  location: string;
}

interface PersonSearchResponse {
  error?: string;
  upgradeRequired?: boolean;
  users?: PersonSearchResult[];
}

export function PersonSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PersonSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [upgradeRequired, setUpgradeRequired] = useState(false);

  const trimmedQuery = query.trim().toLowerCase();

  useEffect(() => {
    if (trimmedQuery.length < 2) {
      setResults([]);
      setIsSearching(false);
      setSearchError(null);
      setUpgradeRequired(false);
      return;
    }

    const controller = new AbortController();
    setIsSearching(true);
    setSearchError(null);
    setUpgradeRequired(false);

    const timeoutId = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/users/search?q=${encodeURIComponent(trimmedQuery)}`,
          { signal: controller.signal },
        );
        const data = (await response.json()) as PersonSearchResponse;

        if (!response.ok) {
          if (data.upgradeRequired) {
            setResults([]);
            setUpgradeRequired(true);
            setSearchError(
              data.error ??
                "You have used your 5 free searches. Upgrade to Pro to keep searching.",
            );
            return;
          }

          throw new Error(data.error ?? "Search request failed");
        }

        setResults(data.users ?? []);
      } catch (error) {
        if ((error as Error).name === "AbortError") {
          return;
        }
        setResults([]);
        setSearchError("Search is unavailable right now");
      } finally {
        if (!controller.signal.aborted) {
          setIsSearching(false);
        }
      }
    }, 400);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [trimmedQuery]);

  function selectUser(targetUserId: string) {
    window.sessionStorage.setItem("targetUserId", targetUserId);
    setQuery("");
    router.push(`/map?targetUserId=${encodeURIComponent(targetUserId)}`);
  }

  return (
    <div className="relative w-full md:max-w-xs">
      <label htmlFor="person-search" className="sr-only">
        Search for anyone
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
          placeholder="Search for anyone..."
          autoComplete="off"
          className="w-full rounded-full border border-[var(--border-soft)] bg-white/80 py-2 pr-4 pl-9 text-sm font-semibold outline-none transition placeholder:text-black/45 focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20 dark:bg-black/25 dark:placeholder:text-white/45"
        />
      </div>

      {trimmedQuery.length >= 2 ? (
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
                      {user.handle ? (
                        <span className="block text-xs text-black/60 dark:text-white/65">
                          @{user.handle}
                        </span>
                      ) : null}
                    </span>
                    {user.location ? (
                      <span className="text-xs font-semibold text-black/45 dark:text-white/45">
                        {user.location}
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : isSearching ? (
            <p className="px-4 py-3 text-sm font-semibold text-black/60 dark:text-white/65">
              Searching...
            </p>
          ) : searchError ? (
            <div className="px-4 py-3">
              <p className="text-sm font-semibold text-red-700 dark:text-red-400">
                {searchError}
              </p>
              {upgradeRequired ? (
                <button
                  type="button"
                  onClick={() => router.push("/checkout")}
                  className="mt-3 inline-flex min-h-9 items-center justify-center rounded-full bg-[var(--accent)] px-4 text-xs font-bold text-white shadow-sm transition hover:brightness-95"
                >
                  Get Pro
                </button>
              ) : null}
            </div>
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
