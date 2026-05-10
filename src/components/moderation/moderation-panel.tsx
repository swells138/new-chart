"use client";

import { MailCheck } from "lucide-react";
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

type ReportQueueFilter = "all" | "report-remove-requests" | "node-reports";

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

function isReportRemoveRequest(report: ModerationReport) {
  return report.kind === "report-remove-request";
}

function reportKindLabel(report: ModerationReport) {
  if (report.kind === "report-remove-request") {
    return "Report / Remove Request";
  }

  if (report.kind === "private-node") {
    return "Private Node";
  }

  return "Public Node";
}

export function ModerationPanel({ initialReports, initialLocks }: Props) {
  const [reports, setReports] = useState(initialReports);
  const [locks, setLocks] = useState(initialLocks);
  const [query, setQuery] = useState("");
  const [queueFilter, setQueueFilter] = useState<ReportQueueFilter>("all");
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [unlockingUserId, setUnlockingUserId] = useState<string | null>(null);
  const [sendingEmailTest, setSendingEmailTest] = useState(false);
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
    return locks.filter((lock) => {
      const haystack = [lock.userId, lock.reason ?? "", lock.lockedBy ?? ""]
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [locks, normalizedQuery]);

  const filteredReports = useMemo(() => {
    return reports.filter((report) => {
      const passesFilter =
        queueFilter === "all"
          ? true
          : queueFilter === "report-remove-requests"
            ? isReportRemoveRequest(report)
            : !isReportRemoveRequest(report);

      if (!passesFilter) {
        return false;
      }

      const haystack = [
        report.targetLabel ?? "",
        report.targetId,
        report.reason ?? "",
        report.reporterLabel ?? "",
        report.reporterUserId ?? "",
        report.kind,
        reportKindLabel(report),
        report.status,
        report.decisionNote ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [reports, normalizedQuery, queueFilter]);

  const reportRemoveRequestCount = useMemo(
    () => reports.filter((report) => isReportRemoveRequest(report)).length,
    [reports],
  );

  async function updateStatus(
    reportId: string,
    status: ModerationReportStatus,
  ) {
    const decisionNote = window
      .prompt(
        "Optional moderation note:",
        status === "dismissed" ? "No action" : "Reviewed",
      )
      ?.trim();

    const action = selectedActionById[reportId] ?? "none";

    setWorkingId(reportId);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/moderation/reports", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
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
      }

      setReports((current) =>
        current.map((r) => (r.id === reportId ? body.report! : r)),
      );
      setMessage("Report updated.");
    } catch {
      setError("Could not update report.");
    } finally {
      setWorkingId(null);
    }
  }

  async function sendEmailTest() {
    setSendingEmailTest(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/moderation/email-test", {
        method: "POST",
      });

      const body = (await response.json()) as {
        error?: string;
        sentTo?: string;
      };

      if (!response.ok || !body.sentTo) {
        setError(body.error ?? "Could not send test email.");
        return;
      }

      setMessage(`Test email sent to ${body.sentTo}.`);
    } catch {
      setError("Could not send test email.");
    } finally {
      setSendingEmailTest(false);
    }
  }

  async function unlockUser(userId: string) {
    setUnlockingUserId(userId);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/moderation/locks", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
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

  return (
    <div className="space-y-4">
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
          Matching locks: {filteredLocks.length} {"\u00B7"} Matching reports:{" "}
          {filteredReports.length}
        </p>
      </div>

      {error ? (
        <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
      ) : null}
      {message ? (
        <p className="text-sm text-green-700 dark:text-green-400">{message}</p>
      ) : null}

      <section className="paper-card rounded-2xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Active Locks</h2>
            <p className="mt-1 text-sm text-black/65 dark:text-white/70">
              Currently locked users: {locks.length}
            </p>
          </div>
        </div>

        {filteredLocks.length === 0 ? (
          <p className="mt-4 rounded-xl border border-[var(--border-soft)] p-4 text-sm text-black/65 dark:text-white/70">
            {locks.length === 0
              ? "No active user locks."
              : "No active user locks match this search."}
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {filteredLocks.map((lock) => {
              const isUnlocking = unlockingUserId === lock.userId;
              return (
                <article
                  key={lock.userId}
                  className="rounded-xl border border-[var(--border-soft)] p-4"
                >
                  <div className="space-y-1 text-xs text-black/65 dark:text-white/70">
                    <p className="text-sm font-semibold text-black dark:text-white">
                      {lock.userId}
                    </p>
                    <p>Reason: {lock.reason || "No reason"}</p>
                    <p>Locked by: {lock.lockedBy || "Unknown"}</p>
                    <p>Expires: {formatDateTime(lock.lockedUntil)}</p>
                  </div>
                  <div className="mt-3">
                    <button
                      type="button"
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
            <p className="text-xs text-black/55 dark:text-white/60">
              Report / Remove requests: {reportRemoveRequestCount}
            </p>
          </div>

          {/* Add a small controls group to the right that includes the existing queue filter and a test-email button */}
          <div className="flex items-center gap-3">
            <label className="text-xs font-semibold text-black/65 dark:text-white/70">
              Queue filter
              <select
                value={queueFilter}
                onChange={(event) =>
                  setQueueFilter(event.target.value as ReportQueueFilter)
                }
                className="ml-2 rounded-lg border border-[var(--border-soft)] bg-transparent px-2 py-1 text-xs outline-none"
              >
                <option value="all">All reports</option>
                <option value="report-remove-requests">
                  Report / Remove requests
                </option>
                <option value="node-reports">Node reports</option>
              </select>
            </label>

            <button
              type="button"
              onClick={sendEmailTest}
              disabled={sendingEmailTest}
              className="ml-2 rounded-full border border-[var(--border-soft)] px-3 py-1.5 text-xs font-semibold disabled:opacity-60 flex items-center gap-2"
            >
              <MailCheck className="h-4 w-4" />
              {sendingEmailTest ? "Sending..." : "Send test email"}
            </button>
          </div>
        </div>

        {filteredReports.length === 0 ? (
          <p className="mt-4 rounded-xl border border-[var(--border-soft)] p-4 text-sm text-black/65 dark:text-white/70">
            {reports.length === 0
              ? "No reports yet."
              : "No reports match this search."}
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {filteredReports.map((report) => {
              const isWorking = workingId === report.id;
              const isReportRemove = isReportRemoveRequest(report);
              return (
                <article
                  key={report.id}
                  className={`rounded-xl border p-4 ${
                    isReportRemove
                      ? "border-amber-300/70 bg-amber-50/60 dark:border-amber-500/40 dark:bg-amber-950/20"
                      : "border-[var(--border-soft)]"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold">
                        {report.targetLabel || report.targetId}
                      </p>
                      <p
                        className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                          isReportRemove
                            ? "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200"
                            : "bg-[var(--accent)]/10 text-[var(--accent)]"
                        }`}
                      >
                        {reportKindLabel(report)}
                      </p>
                    </div>
                    <span className="rounded-full border border-[var(--border-soft)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide">
                      {report.status}
                    </span>
                  </div>

                  <div className="mt-2 space-y-1 text-xs text-black/65 dark:text-white/70">
                    <p>
                      Reporter:{" "}
                      {report.reporterLabel ||
                        report.reporterUserId ||
                        "Unknown"}
                    </p>
                    <p>Submitted: {formatDateTime(report.createdAt)}</p>
                    <p>Target ID: {report.targetId}</p>
                    <p>Reason: {report.reason || "No reason provided"}</p>
                    {report.decisionNote ? (
                      <p>Decision note: {report.decisionNote}</p>
                    ) : null}
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
                          <option value="remove-public-connections">
                            Remove public connections for this node
                          </option>
                          <option value="lock-target-24h">
                            Lock target 24h
                          </option>
                          <option value="lock-target-72h">
                            Lock target 72h
                          </option>
                          <option value="lock-target-7d">Lock target 7d</option>
                        </>
                      ) : report.kind === "private-node" ? (
                        <>
                          <option value="hide-private-node">
                            Hide private node
                          </option>
                          <option value="lock-target-24h">
                            Lock owner 24h
                          </option>
                          <option value="lock-target-72h">
                            Lock owner 72h
                          </option>
                          <option value="lock-target-7d">Lock owner 7d</option>
                        </>
                      ) : null}
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
