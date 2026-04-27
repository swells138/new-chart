"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import type { PendingCreatorConfirmation } from "@/lib/network-claims";

interface Props {
  initialConfirmations: PendingCreatorConfirmation[];
  currentUserId: string;
}

function formatUtcDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toISOString().slice(0, 10);
}

export function ConfirmClaimsPanel({ initialConfirmations, currentUserId }: Props) {
  const router = useRouter();
  const { getToken } = useAuth();
  const [confirmations, setConfirmations] = useState(initialConfirmations);
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

  async function confirmClaim(relationshipId: string) {
    setWorkingId(relationshipId);
    setError(null);

    try {
      const response = await authFetch(`/api/relationships`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: relationshipId, action: "confirmCreator", actorNodeId: currentUserId }),
      });

      const body = (await response.json()) as { error?: string };

      if (!response.ok) {
        const message = body.error ?? "Could not confirm this connection.";
        console.error("confirmClaim failed", {
          relationshipId,
          status: response.status,
          message,
        });
        setError(message);
        if (typeof window !== "undefined") {
          window.alert(`Could not confirm this connection: ${message}`);
        }
        return;
      }

      setConfirmations((current) =>
        current.filter((c) => c.relationshipId !== relationshipId)
      );

      router.refresh();
    } catch {
      const message = "Could not confirm this connection.";
      console.error("confirmClaim request error", { relationshipId });
      setError(message);
      if (typeof window !== "undefined") {
        window.alert(message);
      }
    } finally {
      setWorkingId(null);
    }
  }

  async function rejectClaim(relationshipId: string) {
    setWorkingId(relationshipId);
    setError(null);

    try {
      const response = await authFetch(`/api/relationships`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: relationshipId, action: "reject", actorNodeId: currentUserId }),
      });

      const body = (await response.json()) as { error?: string };

      if (!response.ok) {
        const message = body.error ?? "Could not reject this connection.";
        console.error("rejectClaim failed", {
          relationshipId,
          status: response.status,
          message,
        });
        setError(message);
        if (typeof window !== "undefined") {
          window.alert(`Could not reject this connection: ${message}`);
        }
        return;
      }

      setConfirmations((current) =>
        current.filter((c) => c.relationshipId !== relationshipId)
      );

      router.refresh();
    } catch {
      const message = "Could not reject this connection.";
      console.error("rejectClaim request error", { relationshipId });
      setError(message);
      if (typeof window !== "undefined") {
        window.alert(message);
      }
    } finally {
      setWorkingId(null);
    }
  }

  if (confirmations.length === 0) {
    return null;
  }

  return (
    <section className="paper-card rounded-2xl p-5">
      <h3 className="text-xl font-semibold">Confirm Claimed Connections</h3>
      <p className="mt-1 text-sm text-black/65 dark:text-white/70">
        Someone accepted a placeholder you made as themselves. Confirm it&apos;s them to make the connection public, or reject it if it&apos;s the wrong person.
      </p>

      {error ? (
        <p className="mt-4 text-sm text-red-700 dark:text-red-400">{error}</p>
      ) : null}

      <div className="mt-5 space-y-3">
        {confirmations.map((item) => (
          <article
            key={item.relationshipId}
            className="rounded-xl border border-[var(--border-soft)] p-4"
          >
            <h4 className="text-lg font-semibold">{item.placeholderName}</h4>
            <p className="mt-1 text-xs uppercase tracking-wide text-[var(--accent)]">
              Added as {item.relationshipType}
            </p>
            <p className="mt-2 text-sm text-black/70 dark:text-white/75">
              <span className="font-semibold">{item.claimedByName}</span>
              {item.claimedByHandle ? (
                <span className="ml-1 text-black/50 dark:text-white/50">
                  @{item.claimedByHandle}
                </span>
              ) : null}{" "}
              says this placeholder is them. Is this who you intended?
            </p>
            {item.expiresAt ? (
              <p className="mt-1 text-[11px] text-black/50 dark:text-white/50">
                Expires {formatUtcDate(item.expiresAt)} UTC
              </p>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-2">
              {item.creatorId === currentUserId ? (
                <button
                  type="button"
                  disabled={workingId === item.relationshipId}
                  onClick={() => confirmClaim(item.relationshipId)}
                  className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-70"
                >
                  {workingId === item.relationshipId ? "Saving..." : "Yes, that's them — make public"}
                </button>
              ) : (
                <span className="rounded-full border border-[var(--border-soft)] px-4 py-2 text-xs text-black/60 dark:text-white/60">
                  Waiting for creator confirmation
                </span>
              )}
              <button
                type="button"
                disabled={workingId === item.relationshipId}
                onClick={() => rejectClaim(item.relationshipId)}
                className="rounded-full border border-red-500/40 px-4 py-2 text-sm font-semibold text-red-700 disabled:opacity-60 dark:text-red-300"
              >
                Not the right person
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
