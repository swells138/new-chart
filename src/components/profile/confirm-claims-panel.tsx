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

  async function handleAction(action: "confirmCreator" | "reject", relationshipId: string) {
    setWorkingId(relationshipId);
    setError(null);

    try {
      const response = await fetch(`/api/relationships`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: relationshipId, action, actorNodeId: currentUserId }),
      });

      const body = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(body.error ?? "Could not process this confirmation.");
        return;
      }

      setConfirmations((current) =>
        current.filter((c) => c.relationshipId !== relationshipId)
      );

      router.refresh();
    } catch {
      setError("Could not process this confirmation.");
    } finally {
      setWorkingId(null);
    }
  }

  if (confirmations.length === 0) {
    return null;
  }

  return (
    <section className="paper-card rounded-2xl p-5">
      <h3 className="text-xl font-semibold">Someone Claimed Your Connection</h3>
      <p className="mt-1 text-sm text-black/65 dark:text-white/70">
        A real account matched a placeholder you created. Confirm it&apos;s the right person before the connection goes live.
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
              says this is them. Is this who you had in mind?
            </p>
            {item.expiresAt ? (
              <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-300">
                Expires: {new Date(item.expiresAt).toLocaleDateString()}
              </p>
            ) : null}
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={workingId === item.relationshipId}
                onClick={() => handleAction("confirmCreator", item.relationshipId)}
                className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {workingId === item.relationshipId ? "Saving..." : "Yes, that's them"}
              </button>
              <button
                type="button"
                disabled={workingId === item.relationshipId}
                onClick={() => handleAction("reject", item.relationshipId)}
                className="rounded-full border border-[var(--border-soft)] px-4 py-2 text-sm font-semibold disabled:opacity-60"
              >
                Not this person
              </button>
            </div>
            <p className="mt-2 text-[11px] text-black/50 dark:text-white/50">
              Confirming makes this connection visible on your network. Rejecting hides it.
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
