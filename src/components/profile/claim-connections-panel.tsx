"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@clerk/nextjs";
import type { ClaimCandidate } from "@/types/models";

interface Props {
  initialCandidates: ClaimCandidate[];
  mode: "signup" | "settings";
}

export function ClaimConnectionsPanel({ initialCandidates, mode }: Props) {
  const router = useRouter();
  const { getToken } = useAuth();
  const [claimed, setClaimed] = useState<Set<string>>(new Set());
  const [candidates, setCandidates] = useState(initialCandidates);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function authFetch(input: string, init?: RequestInit) {
    const headers = new Headers(init?.headers);

    try {
      const token = await getToken();
      if (token) {
        headers.set("Authorization", `Bearer ${token}`);
      }
    } catch {
      // Continue without token if Clerk token retrieval fails.
    }

    return fetch(input, {
      ...init,
      headers,
    });
  }

  async function handleAction(action: "claim" | "dismiss", placeholderId: string) {
    setWorkingId(placeholderId);
    setError(null);

    try {
      const response = await authFetch("/api/claim-connections", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action, placeholderId }),
      });

      const body = (await response.json()) as {
        error?: string;
        claimed?: boolean;
        dismissed?: boolean;
        candidates?: ClaimCandidate[];
      };

      if (!response.ok) {
        setError(body.error ?? "Could not update this claim.");
        if (body.candidates) {
          setCandidates(body.candidates);
        }
        return;
      }

      setCandidates((current) =>
        body.candidates ?? current.filter((candidate) => candidate.placeholderId !== placeholderId)
      );

      if (action === "claim") {
        setClaimed((prev) => new Set(prev).add(placeholderId));
        router.refresh();
        return;
      }
    } catch {
      setError("Could not update this claim.");
    } finally {
      setWorkingId(null);
    }
  }

  const isSignup = mode === "signup";

  return (
    <section className="paper-card rounded-2xl p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-xl font-semibold">Claim Connections</h3>
          <p className="mt-1 text-sm text-black/65 dark:text-white/70">
            We only suggest possible matches. Nothing is merged unless you confirm it.
          </p>
        </div>
        {isSignup ? (
          <Link
            href="/map"
            className="rounded-full border border-[var(--border-soft)] px-4 py-2 text-xs font-semibold transition hover:bg-black/5 dark:hover:bg-white/10"
          >
            Skip for now
          </Link>
        ) : null}
      </div>

      {error ? <p className="mt-4 text-sm text-red-700 dark:text-red-400">{error}</p> : null}

      {candidates.length === 0 ? (
        <div className="mt-5 rounded-xl border border-[var(--border-soft)] p-4 text-sm text-black/65 dark:text-white/70">
          {isSignup
            ? "No likely placeholder matches showed up yet. If someone adds you later, you can still claim those connections from your profile settings."
            : "No claimable placeholder matches are available right now."}
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          {candidates.map((candidate) => (
            <article
              key={candidate.placeholderId}
              className="rounded-xl border border-[var(--border-soft)] p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h4 className="text-lg font-semibold">{candidate.name}</h4>
                  <p className="mt-1 text-xs uppercase tracking-wide text-[var(--accent)]">
                    Added as {candidate.relationshipType}
                  </p>
                  <p className="mt-2 text-sm text-black/70 dark:text-white/75">
                    {candidate.ownerName} has you on their chart. Is this you?
                  </p>
                </div>
                <div className="text-right text-xs text-black/55 dark:text-white/60">
                  <p>Added by {candidate.ownerName}</p>
                  {candidate.ownerHandle ? <p>@{candidate.ownerHandle}</p> : null}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-wide text-black/55 dark:text-white/60">
                {candidate.matchReasons.map((reason) => (
                  <span
                    key={reason}
                    className="rounded-full border border-[var(--border-soft)] px-2.5 py-1"
                  >
                    {reason}
                  </span>
                ))}
              </div>

              {candidate.note ? (
                <p className="mt-3 text-sm text-black/70 dark:text-white/75">“{candidate.note}”</p>
              ) : null}

              {(candidate.email || candidate.phoneNumber || candidate.mutualConnectionCount > 0) ? (
                <div className="mt-3 space-y-1 text-sm text-black/65 dark:text-white/70">
                  {candidate.email ? <p>Email: {candidate.email}</p> : null}
                  {candidate.phoneNumber ? <p>Phone: {candidate.phoneNumber}</p> : null}
                  {candidate.mutualConnectionCount > 0 ? (
                    <p>
                      Mutual connections: {candidate.mutualConnectionNames.join(", ")}
                      {candidate.mutualConnectionCount > candidate.mutualConnectionNames.length
                        ? ` +${candidate.mutualConnectionCount - candidate.mutualConnectionNames.length} more`
                        : ""}
                    </p>
                  ) : null}
                </div>
              ) : null}

              <div className="mt-4 flex flex-wrap gap-2">
                {claimed.has(candidate.placeholderId) ? (
                  <p className="text-sm text-black/65 dark:text-white/60">
                    Claimed! Waiting for {candidate.ownerName} to confirm before it becomes public.
                  </p>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => handleAction("claim", candidate.placeholderId)}
                      disabled={workingId === candidate.placeholderId}
                      className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-70"
                    >
                      {workingId === candidate.placeholderId ? "Saving..." : "This is me"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAction("dismiss", candidate.placeholderId)}
                      disabled={workingId === candidate.placeholderId}
                      className="rounded-full border border-[var(--border-soft)] px-4 py-2 text-sm font-semibold disabled:opacity-70"
                    >
                      Not me
                    </button>
                  </>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
