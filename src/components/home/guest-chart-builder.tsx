"use client";

import { useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { Plus, UserPlus, Link2, X, Clock, CheckCircle, ArrowRight } from "lucide-react";

const RELATIONSHIP_TYPES = [
  "Friends",
  "Dating",
  "Talking",
  "Situationship",
  "FWB",
  "Exes",
  "Married",
  "Sneaky Link",
  "Lovers",
  "One Night Stand",
  "complicated",
] as const;

interface GuestConnection {
  id: string;
  name: string;
  type: string;
}

const TYPE_COLORS: Record<string, string> = {
  Friends: "#66b6a7",
  Dating: "#f472b6",
  Talking: "#a78bfa",
  Situationship: "#fb923c",
  FWB: "#63b1ff",
  Exes: "#ff8f84",
  Married: "#e85d8d",
  "Sneaky Link": "#9b8cff",
  Lovers: "#ee82d8",
  "One Night Stand": "#ffbb6f",
  complicated: "#7aa2ff",
};

export function GuestChartBuilder() {
  const [connections, setConnections] = useState<GuestConnection[]>([]);
  const [name, setName] = useState("");
  const [type, setType] = useState<string>("Friends");
  const [inviteOpenId, setInviteOpenId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const demoNodes = useMemo(() => {
    const cx = 360;
    const cy = 190;
    const radius = 130;
    const visible = connections.slice(0, 8);

    return visible.map((conn, index) => {
      const angle = (Math.PI * 2 * index) / Math.max(visible.length, 1) - Math.PI / 2;
      return {
        ...conn,
        x: cx + Math.cos(angle) * radius,
        y: cy + Math.sin(angle) * radius,
        color: TYPE_COLORS[conn.type] ?? "#66b6a7",
      };
    });
  }, [connections]);

  const addConnection = useCallback(() => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setConnections((prev) => [
      ...prev,
      { id: crypto.randomUUID(), name: trimmed, type },
    ]);
    setName("");
  }, [name, type]);

  function removeConnection(id: string) {
    setConnections((prev) => prev.filter((c) => c.id !== id));
    if (inviteOpenId === id) setInviteOpenId(null);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") addConnection();
  }

  function toggleInvite(id: string) {
    setInviteOpenId((prev) => (prev === id ? null : id));
    setCopied(false);
  }

  function handleCopyLink() {
    // Guest users get a placeholder link; real links require sign-in
    void navigator.clipboard.writeText(
      `${window.location.origin}/invite/sign-in-to-generate`
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  }

  const showSaveCta = connections.length >= 2;

  return (
    <section id="start" className="scroll-mt-24">
      <div className="paper-card rounded-3xl p-6 sm:p-8">
        {/* Header */}
        <div className="mb-6">
          <h2 className="text-2xl font-semibold sm:text-3xl">Build your chart</h2>
          <p className="mt-1.5 text-sm text-black/60 dark:text-white/55">
            Add the people you&apos;re connected with — no sign-in required to start.
          </p>
        </div>

        {/* Add form */}
        <div className="mb-6 flex flex-col gap-3 sm:flex-row">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Enter a name…"
            maxLength={50}
            className="flex-1 rounded-xl border border-[var(--border-soft)] bg-white/50 px-4 py-2.5 text-sm outline-none transition focus:border-[var(--accent)]/60 focus:ring-2 focus:ring-[var(--accent)]/20 dark:bg-black/20"
          />
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="rounded-xl border border-[var(--border-soft)] bg-white/50 px-3 py-2.5 text-sm dark:bg-black/20"
          >
            {RELATIONSHIP_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={addConnection}
            disabled={!name.trim()}
            className="flex items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-[var(--accent)]/20 transition hover:brightness-95 active:scale-95 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <Plus size={15} />
            Add
          </button>
        </div>

        {/* Live chart preview */}
        {connections.length > 0 ? (
          <div className="space-y-4">
            <div className="overflow-hidden rounded-2xl border border-white/10" style={{ background: "#10071b" }}>
              <svg viewBox="0 0 720 380" className="block h-auto w-full" aria-label="Live guest chart preview">
                <defs>
                  <pattern id="guest-grid" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
                    <circle cx="12" cy="12" r="1" fill="rgba(255,255,255,0.06)" />
                  </pattern>
                </defs>

                <rect width="720" height="380" fill="url(#guest-grid)" />

                {demoNodes.map((node) => {
                  const mx = (360 + node.x) / 2;
                  const my = (190 + node.y) / 2;
                  return (
                    <g key={`edge-${node.id}`}>
                      <line
                        x1={360}
                        y1={190}
                        x2={node.x}
                        y2={node.y}
                        stroke={node.color}
                        strokeWidth="2"
                        strokeOpacity="0.75"
                      />
                      <rect
                        x={mx - 28}
                        y={my - 10}
                        width="56"
                        height="18"
                        rx="5"
                        fill="rgba(10,6,20,0.85)"
                        stroke={node.color}
                        strokeWidth="0.75"
                        strokeOpacity="0.6"
                      />
                      <text
                        x={mx}
                        y={my + 3}
                        textAnchor="middle"
                        fill={node.color}
                        fontSize="10"
                        fontWeight="600"
                        fontFamily="system-ui"
                      >
                        {node.type}
                      </text>
                    </g>
                  );
                })}

                <g>
                  <circle cx="360" cy="190" r="30" fill="#ff8f84" fillOpacity="0.18" />
                  <circle cx="360" cy="190" r="24" fill="#ff8f84" />
                  <text x="360" y="195" textAnchor="middle" fill="white" fontSize="13" fontWeight="700" fontFamily="system-ui">
                    YOU
                  </text>
                </g>

                {demoNodes.map((node) => (
                  <g key={node.id}>
                    <circle cx={node.x} cy={node.y} r="26" fill={node.color} fillOpacity="0.18" />
                    <circle cx={node.x} cy={node.y} r="20" fill={node.color} />
                    <text
                      x={node.x}
                      y={node.y + 4}
                      textAnchor="middle"
                      fill="white"
                      fontSize="12"
                      fontWeight="700"
                      fontFamily="system-ui"
                    >
                      {node.name[0].toUpperCase()}
                    </text>
                    <rect x={node.x - 36} y={node.y + 26} width="72" height="18" rx="8" fill="rgba(0,0,0,0.58)" />
                    <text
                      x={node.x}
                      y={node.y + 38}
                      textAnchor="middle"
                      fill="rgba(255,255,255,0.88)"
                      fontSize="10"
                      fontWeight="600"
                      fontFamily="system-ui"
                    >
                      {node.name.split(" ")[0]}
                    </text>
                  </g>
                ))}
              </svg>
            </div>

            <div className="space-y-2">
              {connections.map((conn) => (
                <div
                  key={conn.id}
                  className="flex items-center gap-3 rounded-xl border border-[var(--border-soft)] bg-white/30 p-3 transition dark:bg-black/15"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--accent)]/15 text-sm font-bold text-[var(--accent)]">
                    {conn.name[0].toUpperCase()}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{conn.name}</p>
                    <p className="text-xs text-black/50 dark:text-white/50">{conn.type}</p>
                  </div>

                  <span className="hidden items-center gap-1 rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-[10px] font-semibold text-amber-500 sm:flex">
                    <Clock size={9} />
                    Pending
                  </span>

                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => toggleInvite(conn.id)}
                      className="flex items-center gap-1.5 rounded-lg border border-[var(--border-soft)] px-2.5 py-1.5 text-xs font-semibold transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
                      aria-expanded={inviteOpenId === conn.id}
                    >
                      <UserPlus size={12} />
                      <span className="hidden sm:inline">Invite to confirm</span>
                      <span className="sm:hidden">Invite</span>
                    </button>

                    {inviteOpenId === conn.id && (
                      <div className="absolute right-0 top-full z-20 mt-1.5 w-64 rounded-2xl border border-[var(--border-soft)] bg-[var(--card)] p-4 shadow-2xl">
                        <p className="mb-3 text-xs font-semibold">
                          Invite{" "}
                          <span className="text-[var(--accent)]">{conn.name}</span> to confirm
                        </p>

                        <button
                          type="button"
                          onClick={handleCopyLink}
                          className="mb-2 flex w-full items-center gap-2 rounded-xl border border-[var(--border-soft)] px-3 py-2 text-xs transition hover:border-[var(--accent)]/60"
                        >
                          {copied ? (
                            <CheckCircle size={13} className="shrink-0 text-green-500" />
                          ) : (
                            <Link2 size={13} className="shrink-0" />
                          )}
                          {copied ? "Copied!" : "Copy invite link"}
                        </button>

                        <p className="mb-3 text-[10px] leading-relaxed text-black/50 dark:text-white/45">
                          Sign in to generate a real invite link tied to this connection.
                        </p>

                        <Link
                          href="/signup"
                          className="flex items-center justify-center gap-1.5 rounded-xl bg-[var(--accent)] px-3 py-2 text-xs font-semibold text-white transition hover:brightness-95"
                        >
                          Sign in to send invite <ArrowRight size={11} />
                        </Link>
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => removeConnection(conn.id)}
                    className="shrink-0 text-black/25 transition hover:text-black/60 dark:text-white/25 dark:hover:text-white/60"
                    aria-label={`Remove ${conn.name}`}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--border-soft)] py-12 text-center">
            <p className="text-sm text-black/40 dark:text-white/40">
              Your connections will appear here
            </p>
            <p className="text-xs text-black/30 dark:text-white/30">
              Start by adding someone above
            </p>
          </div>
        )}

        {/* Save CTA — appears after 2+ connections */}
        {showSaveCta && (
          <div className="mt-5 flex flex-col gap-3 rounded-2xl bg-[var(--accent)]/10 p-4 ring-1 ring-[var(--accent)]/30 sm:flex-row sm:items-center">
            <div className="flex-1">
              <p className="text-sm font-semibold">Save your chart to keep your connections</p>
              <p className="mt-0.5 text-xs text-black/60 dark:text-white/55">
                Create a free account to save, share, and grow your chart.
              </p>
            </div>
            <Link
              href="/signup"
              className="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-[var(--accent)]/20 transition hover:brightness-95"
            >
              Save chart <ArrowRight size={14} />
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
