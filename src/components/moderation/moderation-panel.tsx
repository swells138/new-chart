"use client";

import { useMemo, useState } from "react";
import type {
  ModerationReport,
  ModerationReportStatus,
  ModerationUserLock,
} from "@/lib/moderation/reports";

interface Props {
  initialReports: ModerationReport[];
  initialLocks: ModerationUserLock[];
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}

export function ModerationPanel({ initialReports, initialLocks }: Props) {
  const [reports, setReports] = useState(initialReports);
  const [locks, setLocks] = useState(initialLocks);
  const [query, setQuery] = useState("");
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [unlockingUserId, setUnlockingUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedActionById, setSelectedActionById] = useState<
    Record<string, string>
  >({});

  const openCount = useMemo(
    () => reports.filter((report) => report.status === "open").length,
    [reports],
  );

  const normalizedQuery = query.trim().toLowerCase();

  const filteredLocks = useMemo(() => {
    if (!normalizedQuery) {
      return locks;
    }

    return locks.filter((lock) => {
      const haystack = [
        lock.userId,
        lock.reason ?? "",
        lock.lockedBy ?? "",
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedQuery);
    });
  }, [locks, normalizedQuery]);

  const filteredReports = useMemo(() => {
    if (!normalizedQuery) {
      return reports;
    }

    return reports.filter((report) => {
      const haystack = [
        report.targetLabel ?? "",
        report.targetId,
        report.reason ?? "",
        report.reporterLabel ?? "",
        report.reporterUserId ?? "",
        report.kind,
        report.status,
        report.decisionNote ?? "",
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedQuery);
    });
  }, [reports, normalizedQuery]);

  async function updateStatus(reportId: string, status: ModerationReportStatus) {
    const decisionNote = window
      .prompt("Optional moderation note:", status === "dismissed" ? "No action" : "Reviewed")
      ?.trim();

    const action = selectedActionById[reportId] ?? "none";

    setWorkingId(reportId);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/moderation/reports", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: reportId,
          status,
          decisionNote: decisionNote || undefined,
          action,
        }),
      });

      const body = (await response.json()) as {
        error?: string;
        report?: ModerationReport;
      };

      if (!response.ok || !body.report) {
        setError(body.error ?? "Could not update report.");
        return;

        async function unlockUser(userId: string) {
          setUnlockingUserId(userId);
          setError(null);
          setMessage(null);

          try {
            const response = await fetch("/api/moderation/locks", {
              method: "DELETE",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ userId }),
            });

            const body = (await response.json()) as {
              error?: string;
              unlockedUserId?: string;
            };

            if (!response.ok || !body.unlockedUserId) {
              setError(body.error ?? "Could not clear lock.");
              return;
            }

            setLocks((current) =>
              current.filter((lock) => lock.userId !== body.unlockedUserId),
            );
            setMessage("User lock cleared.");
          } catch {
            setError("Could not clear lock.");
          } finally {
            setUnlockingUserId(null);
          }
        }
      }

          <div className="space-y-4">
            <section className="paper-card rounded-2xl p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold">Active Locks</h2>
                  <p className="mt-1 text-sm text-black/65 dark:text-white/70">
                    Currently locked users: {locks.length}
                  </p>
                </div>
              </div>

              {locks.length === 0 ? (
                <p className="mt-4 rounded-xl border border-[var(--border-soft)] p-4 text-sm text-black/65 dark:text-white/70">
                  No active user locks.
    } catch {
              ) : (
                <div className="mt-4 space-y-3">
                  {locks.map((lock) => {
                    <div className="mb-4 rounded-xl border border-[var(--border-soft)] p-3">
                      <label
                        htmlFor="moderation-search"
                        className="text-[11px] font-semibold uppercase tracking-wide text-black/60 dark:text-white/65"
                      >
                        Search moderation
                      </label>
                      <input
                        id="moderation-search"
                        type="search"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Search by user id, target, reason, or status"
                        className="mt-1 w-full rounded-lg border border-[var(--border-soft)] bg-transparent px-3 py-2 text-sm outline-none"
                      />
                      <p className="mt-1 text-[11px] text-black/55 dark:text-white/60">
                        Matching locks: {filteredLocks.length} · Matching reports: {filteredReports.length}
                      </p>
                    </div>

                    const isUnlocking = unlockingUserId === lock.userId;

                    return (
                      <article
                          Currently locked users: {locks.length}
                        className="rounded-xl border border-[var(--border-soft)] p-4"
                      >
                        <div className="space-y-1 text-xs text-black/65 dark:text-white/70">
                          <p className="text-sm font-semibold text-black dark:text-white">{lock.userId}</p>
                    {filteredLocks.length === 0 ? (
                          <p>Locked by: {lock.lockedBy || "Unknown"}</p>
                        No active user locks match this search.
                        </div>
                        <div className="mt-3">
                          <button
                        {filteredLocks.map((lock) => {
                            onClick={() => unlockUser(lock.userId)}
                            disabled={isUnlocking}
                            className="rounded-full border border-[var(--border-soft)] px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
                          >
                            {isUnlocking ? "Unlocking..." : "Unlock user"}
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="paper-card rounded-2xl p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold">Moderation Queue</h2>
                  <p className="mt-1 text-sm text-black/65 dark:text-white/70">
                    Open reports: {openCount}
                  </p>
                </div>
              </div>
    } finally {
              {error ? <p className="mt-3 text-sm text-red-700 dark:text-red-400">{error}</p> : null}
              {message ? (
                <p className="mt-3 text-sm text-green-700 dark:text-green-400">{message}</p>
              ) : null}
  return (
              {filteredReports.length === 0 ? (
                <p className="mt-4 rounded-xl border border-[var(--border-soft)] p-4 text-sm text-black/65 dark:text-white/70">
                  No reports match this search.
                </p>
              ) : (
                <div className="mt-4 space-y-3">
                  {filteredReports.map((report) => {
                    const isWorking = workingId === report.id;
      </div>

      {error ? <p className="mt-3 text-sm text-red-700 dark:text-red-400">{error}</p> : null}
      {message ? (
        <p className="mt-3 text-sm text-green-700 dark:text-green-400">{message}</p>
      ) : null}

      {reports.length === 0 ? (
        <p className="mt-4 rounded-xl border border-[var(--border-soft)] p-4 text-sm text-black/65 dark:text-white/70">
          No reports yet.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {reports.map((report) => {
            const isWorking = workingId === report.id;

              return (
                <article
                  key={report.id}
                  className="rounded-xl border border-[var(--border-soft)] p-4"
                >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">
                      {report.targetLabel || report.targetId}
                    </p>
                    <p className="text-xs uppercase tracking-wide text-[var(--accent)]">
                      {report.kind}
                    </p>
                  </div>
                  <span className="rounded-full border border-[var(--border-soft)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide">
                    {report.status}
                  </span>
                </div>

                <div className="mt-2 space-y-1 text-xs text-black/65 dark:text-white/70">
                  <p>Reporter: {report.reporterLabel || report.reporterUserId || "Unknown"}</p>
                  <p>Submitted: {formatDateTime(report.createdAt)}</p>
                  <p>Target ID: {report.targetId}</p>
                  <p>Reason: {report.reason || "No reason provided"}</p>
                  {report.decisionNote ? <p>Decision note: {report.decisionNote}</p> : null}
                </div>

                <div className="mt-3">
                  <label className="text-[11px] font-semibold uppercase tracking-wide text-black/60 dark:text-white/65">
                    Resolve action
                  </label>
                  <select
                    value={selectedActionById[report.id] ?? "none"}
                    onChange={(event) =>
                      setSelectedActionById((current) => ({
                        ...current,
                        [report.id]: event.target.value,
                      }))
                    }
                    className="mt-1 w-full rounded-lg border border-[var(--border-soft)] bg-transparent px-2 py-1.5 text-xs outline-none"
                    disabled={isWorking}
                  >
                    <option value="none">No extra action</option>
                    {report.kind === "public-node" ? (
                      <>
                        <option value="remove-public-connections">Remove public connections for this node</option>
                        <option value="lock-target-24h">Lock target 24h</option>
                        <option value="lock-target-72h">Lock target 72h</option>
                        <option value="lock-target-7d">Lock target 7d</option>
                      </>
                    ) : (
                      <>
                        <option value="hide-private-node">Hide private node</option>
                        <option value="lock-target-24h">Lock owner 24h</option>
                        <option value="lock-target-72h">Lock owner 72h</option>
                        <option value="lock-target-7d">Lock owner 7d</option>
                      </>
                    )}
                  </select>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => updateStatus(report.id, "resolved")}
                    disabled={isWorking || report.status === "resolved"}
                    className="rounded-full bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                  >
                    {isWorking ? "Saving..." : "Mark resolved"}
                  </button>
                  <button
                    type="button"
                    onClick={() => updateStatus(report.id, "dismissed")}
                    disabled={isWorking || report.status === "dismissed"}
                    className="rounded-full border border-[var(--border-soft)] px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
                  >
                    Dismiss
                  </button>
                  <button
                    type="button"
                    onClick={() => updateStatus(report.id, "open")}
                    disabled={isWorking || report.status === "open"}
                    className="rounded-full border border-[var(--border-soft)] px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
                  >
                    Re-open
                  </button>
                </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
