"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PendingCreatorConfirmation } from "@/lib/network-claims";

interface Props {
  initialConfirmations: PendingCreatorConfirmation[];
  currentUserId: string;
}

export function ConfirmClaimsPanel({ initialConfirmations, currentUserId }: Props) {
  const router = useRouter();
  const [confirmations, setConfirmations] = useState(initialConfirmations);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function removeConnection(relationshipId: string) {
    setWorkingId(relationshipId);
    setError(null);

    try {
      const response = await fetch(`/api/relationships`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: relationshipId, actorNodeId: currentUserId }),
      });

      const body = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(body.error ?? "Could not remove this connection.");
        return;
      }

      setConfirmations((current) =>
        current.filter((c) => c.relationshipId !== relationshipId)
      );

      router.refresh();
    } catch {
      setError("Could not remove this connection.");
    } finally {
      setWorkingId(null);
    }
  }

  if (confirmations.length === 0) {
    return null;
  }

  return (
    <section className="paper-card rounded-2xl p-5">
      <h3 className="text-xl font-semibold">Recent Claimed Connections</h3>
      <p className="mt-1 text-sm text-black/65 dark:text-white/70">
        Someone matched a placeholder you created. These connections are now live — remove if it&apos;s the wrong person.
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
              claimed this is them. The connection is now live on your chart.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={workingId === item.relationshipId}
                onClick={() => removeConnection(item.relationshipId)}
                className="rounded-full border border-red-500/40 px-4 py-2 text-sm font-semibold text-red-700 disabled:opacity-60 dark:text-red-300"
              >
                {workingId === item.relationshipId ? "Removing..." : "Not the right person — remove"}
              </button>
            </div>
            <p className="mt-2 text-[11px] text-black/50 dark:text-white/50">
              Removing this disconnects them and hides the connection from your chart.
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
