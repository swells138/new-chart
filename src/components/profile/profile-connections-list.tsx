"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export interface ProfileConnectionItem {
  id: string;
  type: string;
  person: {
    name: string | null;
    handle: string | null;
    location: string | null;
  };
}

const connectionLabels: Record<string, string> = {
  Exes: "Exes",
  Married: "Married",
  "Sneaky Link": "Sneaky Link",
  Friends: "Friends",
  Lovers: "Lovers",
  "One Night Stand": "One Night Stand",
  complicated: "complicated",
  FWB: "FWB",
};

interface Props {
  initialConnections: ProfileConnectionItem[];
  currentUserId: string;
}

export function ProfileConnectionsList({ initialConnections, currentUserId }: Props) {
  const [connections, setConnections] = useState(initialConnections);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hasConnections = useMemo(() => connections.length > 0, [connections]);

  async function removeConnection(id: string) {
    const confirmed = window.confirm("Remove this connection?");
    if (!confirmed) {
      return;
    }

    setWorkingId(id);
    setError(null);

    try {
      const response = await fetch("/api/relationships", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id, actorNodeId: currentUserId }),
      });

      const body = (await response.json()) as { error?: string; deleted?: boolean };

      if (!response.ok || !body.deleted) {
        setError(body.error ?? "Could not remove this connection.");
        return;
      }

      setConnections((current) => current.filter((item) => item.id !== id));
    } catch {
      setError("Could not remove this connection.");
    } finally {
      setWorkingId(null);
    }
  }

  return (
    <>
      {error ? <p className="mt-3 text-sm text-red-700 dark:text-red-400">{error}</p> : null}
      {!hasConnections ? (
        <p className="mt-3 text-sm text-black/70 dark:text-white/75">
          You do not have any approved connections yet.
        </p>
      ) : (
        <div className="mt-3 space-y-2">
          {connections.map((connection) => (
            <article
              key={connection.id}
              className="rounded-xl border border-[var(--border-soft)] p-3 text-sm"
            >
              <p className="font-semibold">
                {connection.person.name ?? connection.person.handle ?? "Unnamed member"}
              </p>
              <p className="mt-1 text-xs text-black/60 dark:text-white/70">
                {connectionLabels[connection.type] ?? "Connection"}
                {connection.person.location ? ` · ${connection.person.location}` : ""}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => removeConnection(connection.id)}
                  disabled={workingId === connection.id}
                  className="rounded-full border border-red-500/40 px-3 py-1 text-xs font-semibold text-red-700 disabled:opacity-60 dark:text-red-300"
                >
                  {workingId === connection.id ? "Removing..." : "Remove connection"}
                </button>
                <Link
                  href={`/report?link=${encodeURIComponent(`/profile?connectionId=${connection.id}`)}&reason=${encodeURIComponent("Please review this connection.")}`}
                  className="rounded-full border border-[var(--border-soft)] px-3 py-1 text-xs font-semibold transition hover:bg-black/5 dark:hover:bg-white/10"
                >
                  Report connection
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
