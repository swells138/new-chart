"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import type {
  PlaceholderPerson,
  Relationship,
  RelationshipType,
  User,
} from "@/types/models";

const ALL_TYPES: RelationshipType[] = [
  "Talking",
  "Dating",
  "Situationship",
  "Exes",
  "Married",
  "Sneaky Link",
  "Friends",
  "Lovers",
  "One Night Stand",
  "complicated",
  "FWB",
];

const TYPE_COLORS: Record<RelationshipType, string> = {
  Talking: "#a78bfa",
  Dating: "#f472b6",
  Situationship: "#fb923c",
  Exes: "#ff8f84",
  Married: "#e85d8d",
  "Sneaky Link": "#9b8cff",
  Friends: "#66b6a7",
  Lovers: "#ee82d8",
  "One Night Stand": "#ffbb6f",
  complicated: "#7aa2ff",
  FWB: "#63b1ff",
};

const STATUS_LABELS: Record<PlaceholderPerson["claimStatus"], string> = {
  unclaimed: "Waiting for signup",
  invited: "Invite sent",
  claimed: "Moved to verification",
  denied: "Declined",
};

interface Props {
  initialPlaceholders: PlaceholderPerson[];
  baseUrl: string;
  currentUserId: string | null;
  approvedConnections?: Relationship[];
  users?: User[];
}

interface ExistingUserSuggestion {
  kind: "existing-user";
  user: {
    id: string;
    name: string | null;
    handle: string | null;
  };
  message: string;
}

interface PublicConnectCandidate {
  placeholderId: string;
  userId: string;
  name: string;
  relationshipType: RelationshipType;
}

export function PrivateChart({
  initialPlaceholders,
  baseUrl,
  currentUserId,
  approvedConnections = [],
  users = [],
}: Props) {
  const [placeholders, setPlaceholders] =
    useState<PlaceholderPerson[]>(initialPlaceholders);
  const [highlightedConnectionId, setHighlightedConnectionId] = useState<
    string | null
  >(null);
  const highlightTimeoutRef = useRef<number | null>(null);
  const { getToken } = useAuth();

  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current !== null) {
        window.clearTimeout(highlightTimeoutRef.current);
      }
    };
  }, []);

  function highlightConnection(id: string) {
    setHighlightedConnectionId(id);
    if (highlightTimeoutRef.current !== null) {
      window.clearTimeout(highlightTimeoutRef.current);
    }
    highlightTimeoutRef.current = window.setTimeout(() => {
      setHighlightedConnectionId((current) =>
        current === id ? null : current,
      );
      highlightTimeoutRef.current = null;
    }, 1400);
  }

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

  const currentUserName = useMemo(() => {
    if (!currentUserId) return "You";
    return users.find((user) => user.id === currentUserId)?.name || "You";
  }, [users, currentUserId]);

  const chartConnections = useMemo(() => {
    const privateItems = placeholders.map((item) => ({
      id: `private-${item.id}`,
      name: item.name,
      type: item.relationshipType,
      color: TYPE_COLORS[item.relationshipType] ?? "#888",
      kind: "private" as const,
    }));

    const usersById = new Map(users.map((u) => [u.id, u]));
    const seenPublic = new Set<string>();
    const publicItems = approvedConnections
      .map((rel) => {
        const otherId = rel.source === currentUserId ? rel.target : rel.source;
        if (!otherId || seenPublic.has(otherId)) {
          return null;
        }
        seenPublic.add(otherId);
        const other = usersById.get(otherId);
        if (!other) {
          return null;
        }
        return {
          id: `public-${otherId}`,
          name: other.name,
          type: rel.type,
          color: TYPE_COLORS[rel.type] ?? "#888",
          kind: "public" as const,
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));

    return [...privateItems, ...publicItems].slice(0, 12);
  }, [placeholders, approvedConnections, users, currentUserId]);

  const discoveredConnections = chartConnections.length;

  // Add-form state
  const [addName, setAddName] = useState("");
  const [addEmail, setAddEmail] = useState("");
  const [addPhoneNumber, setAddPhoneNumber] = useState("");
  const [addType, setAddType] = useState<RelationshipType>("Friends");
  const [addNote, setAddNote] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [addHint, setAddHint] = useState<string | null>(null);
  const [publicConnectCandidates, setPublicConnectCandidates] = useState<
    Record<string, PublicConnectCandidate>
  >({});
  const [publicConnectingPlaceholderId, setPublicConnectingPlaceholderId] =
    useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  function getAddErrorMessage(status: number, apiMessage?: string) {
    if (apiMessage && apiMessage.trim()) {
      return apiMessage;
    }

    if (status === 400) {
      return "Check the form values and try again.";
    }

    if (status === 401 || status === 403) {
      return "Sign in again, then retry.";
    }

    if (status === 409) {
      return "Your profile session changed. Refresh and try again.";
    }

    if (status === 429) {
      return "Too many attempts. Wait a moment and retry.";
    }

    return "Could not add that connection right now.";
  }

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhoneNumber, setEditPhoneNumber] = useState("");
  const [editType, setEditType] = useState<RelationshipType>("Friends");
  const [editNote, setEditNote] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Invite/action state
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const name = addName.trim();
    if (!name) {
      setAddError("A name is required.");
      return;
    }
    setIsAdding(true);
    setAddError(null);
    setAddHint(null);

    try {
      const res = await authFetch("/api/private-connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email: addEmail.trim() || undefined,
          phoneNumber: addPhoneNumber.trim() || undefined,
          relationshipType: addType,
          note: addNote.trim() || undefined,
        }),
      });
      const body = (await res.json()) as {
        placeholder?: PlaceholderPerson;
        error?: string;
        suggestion?: ExistingUserSuggestion | null;
      };
      if (!res.ok || !body.placeholder) {
        setAddError(getAddErrorMessage(res.status, body.error));
        return;
      }
      const createdPlaceholder = body.placeholder;
      const suggestion = body.suggestion;
      const nextPrivateCount = placeholders.length + 1;

      setPlaceholders((prev) => [createdPlaceholder, ...prev]);
      if (nextPrivateCount === 2 || nextPrivateCount === 3) {
        highlightConnection(`private-${createdPlaceholder.id}`);
      }
      if (suggestion?.kind === "existing-user") {
        const displayName =
          suggestion.user.name || suggestion.user.handle || "that person";
        setAddHint(
          `${suggestion.message} We found a likely match: ${displayName}.`,
        );
        setPublicConnectCandidates((prev) => ({
          ...prev,
          [createdPlaceholder.id]: {
            placeholderId: createdPlaceholder.id,
            userId: suggestion.user.id,
            name: displayName,
            relationshipType: createdPlaceholder.relationshipType,
          },
        }));
      }
      setAddName("");
      setAddEmail("");
      setAddPhoneNumber("");
      setAddNote("");
    } catch {
      setAddError("Could not add that connection right now.");
    } finally {
      setIsAdding(false);
    }
  }

  async function handleGenerateInvite(id: string) {
    setWorkingId(id);
    setActionError(null);
    setActionMessage(null);
    try {
      const res = await authFetch("/api/private-connections", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "generateInvite" }),
      });
      const body = (await res.json()) as {
        placeholder?: PlaceholderPerson;
        error?: string;
      };
      if (!res.ok || !body.placeholder) {
        setActionError(
          body.error ?? "Could not generate invite. Please try again.",
        );
        return;
      }
      setPlaceholders((prev) =>
        prev.map((p) => (p.id === id ? body.placeholder! : p)),
      );
      setActionMessage("Invite generated. Copy and share the link.");
    } finally {
      setWorkingId(null);
    }
  }

  async function handleRevokeInvite(id: string) {
    setWorkingId(id);
    setActionError(null);
    setActionMessage(null);
    try {
      const res = await authFetch("/api/private-connections", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "revokeInvite" }),
      });
      const body = (await res.json()) as {
        placeholder?: PlaceholderPerson;
        error?: string;
      };
      if (!res.ok || !body.placeholder) {
        setActionError(body.error ?? "Could not revoke invite right now.");
        return;
      }
      setPlaceholders((prev) =>
        prev.map((p) => (p.id === id ? body.placeholder! : p)),
      );
      setActionMessage("Invite link revoked.");
    } finally {
      setWorkingId(null);
    }
  }

  async function handleDelete(id: string) {
    setWorkingId(id);
    setActionError(null);
    try {
      const res = await authFetch("/api/private-connections", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      let body: unknown;
      try {
        body = (await res.json()) as {
          deleted?: boolean;
          id?: string;
          error?: string;
        };
      } catch {
        setActionError("Invalid response from server.");
        return;
      }
      const parsed = body as { deleted?: boolean; id?: string; error?: string };
      if (!res.ok || !parsed.deleted) {
        // Log full response for debugging so we can see why deletion failed locally
        console.error("Delete failed:", { status: res.status, body: parsed });
        setActionError(
          parsed.error ?? "Could not remove this connection. Please try again.",
        );
        return;
      }

      // Log success for debugging (no behavior change)
      console.info("Delete succeeded:", { id });

      setPlaceholders((prev) => prev.filter((p) => p.id !== id));
      setPublicConnectCandidates((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      if (editingId === id) setEditingId(null);
      setActionMessage("Connection removed.");
    } catch (error) {
      console.error("Delete error:", error);
      setActionError("Could not remove this connection. Please try again.");
    } finally {
      setWorkingId(null);
    }
  }

  function startEdit(p: PlaceholderPerson) {
    setEditingId(p.id);
    setEditName(p.name);
    setEditEmail(p.email);
    setEditPhoneNumber(p.phoneNumber);
    setEditType(p.relationshipType);
    setEditNote(p.note);
    setEditError(null);
  }

  async function handleSaveEdit(id: string) {
    setIsSaving(true);
    setEditError(null);
    try {
      const res = await authFetch("/api/private-connections", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          action: "update",
          name: editName.trim(),
          email: editEmail.trim() || undefined,
          phoneNumber: editPhoneNumber.trim() || undefined,
          relationshipType: editType,
          note: editNote.trim() || undefined,
        }),
      });
      const body = (await res.json()) as {
        placeholder?: PlaceholderPerson;
        error?: string;
      };
      if (!res.ok || !body.placeholder) {
        setEditError(body.error ?? "Could not save changes.");
        return;
      }
      setPlaceholders((prev) =>
        prev.map((p) => (p.id === id ? body.placeholder! : p)),
      );
      setEditingId(null);
    } catch {
      setEditError("Could not save changes.");
    } finally {
      setIsSaving(false);
    }
  }

  async function copyInviteLink(p: PlaceholderPerson) {
    if (!p.inviteToken) return;
    const link = `${baseUrl}/invite/${p.inviteToken}`;
    await navigator.clipboard.writeText(link).catch(() => null);
    setCopiedId(p.id);
    setTimeout(
      () => setCopiedId((prev) => (prev === p.id ? null : prev)),
      2000,
    );
  }

  async function handleConnectPublicly(candidate: PublicConnectCandidate) {
    if (!currentUserId) {
      setActionError("Sign in and reload to connect publicly.");
      return;
    }

    setPublicConnectingPlaceholderId(candidate.placeholderId);
    setActionError(null);
    setActionMessage(null);

    try {
      const res = await authFetch("/api/relationships", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: currentUserId,
          target: candidate.userId,
          type: candidate.relationshipType,
        }),
      });

      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        setActionError(
          body.error ?? "Could not send a public connection request.",
        );
        return;
      }

      setActionMessage(`Public connection request sent to ${candidate.name}.`);
      setPublicConnectCandidates((prev) => {
        const next = { ...prev };
        delete next[candidate.placeholderId];
        return next;
      });
    } catch {
      setActionError("Could not send a public connection request.");
    } finally {
      setPublicConnectingPlaceholderId(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Privacy banner */}

      <section
        className="overflow-hidden rounded-2xl border border-white/10"
        style={{ background: "#0f0819" }}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <p className="text-xs font-bold uppercase tracking-wider text-white/55">
            Direct connections
          </p>
          <div className="flex items-center gap-2 text-[10px] text-white/50">
            <span className="rounded-full border border-white/15 px-2 py-0.5">
              Placeholder dashed
            </span>
            <span className="rounded-full border border-white/15 px-2 py-0.5">
              Confirmed solid
            </span>
          </div>
        </div>
        <div className="flex flex-col gap-2 border-b border-white/10 px-4 py-3 text-white/70 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-medium">
            Add more people to reveal deeper connections
          </p>
          <p className="self-start rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-white/65 sm:self-auto">
            Connections discovered: {discoveredConnections}
          </p>
        </div>
        <svg
          viewBox="0 0 880 460"
          className="block h-auto w-full"
          aria-label="Direct connection chart"
        >
          <defs>
            <pattern
              id="private-grid"
              x="0"
              y="0"
              width="26"
              height="26"
              patternUnits="userSpaceOnUse"
            >
              <circle cx="13" cy="13" r="1" fill="rgba(255,255,255,0.06)" />
            </pattern>
          </defs>

          <rect width="880" height="460" fill="url(#private-grid)" />

          {chartConnections.map((item, index) => {
            const cx = 440;
            const cy = 220;
            const ring = index < 8 ? 150 : 210;
            const ringIndex = index < 8 ? index : index - 8;
            const ringTotal =
              index < 8
                ? Math.min(chartConnections.length, 8)
                : Math.max(chartConnections.length - 8, 1);
            const angle = (Math.PI * 2 * ringIndex) / ringTotal - Math.PI / 2;
            const x = cx + Math.cos(angle) * ring;
            const y = cy + Math.sin(angle) * (index < 8 ? 125 : 170);
            const mx = (cx + x) / 2;
            const my = (cy + y) / 2;

            return (
              <g key={item.id}>
                <line
                  x1={cx}
                  y1={cy}
                  x2={x}
                  y2={y}
                  stroke={item.color}
                  strokeWidth={highlightedConnectionId === item.id ? 3 : 2}
                  strokeOpacity={
                    highlightedConnectionId === item.id ? 0.95 : 0.75
                  }
                  strokeDasharray={item.kind === "private" ? "7 4" : undefined}
                  className={
                    highlightedConnectionId === item.id
                      ? "private-connection-line-reveal"
                      : undefined
                  }
                />
                <rect
                  x={mx - 31}
                  y={my - 10}
                  width="62"
                  height="18"
                  rx="5"
                  fill="rgba(10,6,20,0.85)"
                  stroke={item.color}
                  strokeWidth="0.75"
                  strokeOpacity="0.55"
                />
                <text
                  x={mx}
                  y={my + 3}
                  textAnchor="middle"
                  fontSize="10"
                  fontWeight="600"
                  fill={item.color}
                  fontFamily="system-ui"
                >
                  {item.type}
                </text>

                <circle
                  cx={x}
                  cy={y}
                  r="28"
                  fill={item.color}
                  fillOpacity="0.17"
                  className={
                    highlightedConnectionId === item.id
                      ? "private-connection-node-reveal"
                      : undefined
                  }
                />
                <circle
                  cx={x}
                  cy={y}
                  r="22"
                  fill={item.color}
                  className={
                    highlightedConnectionId === item.id
                      ? "private-connection-node-reveal"
                      : undefined
                  }
                />
                <text
                  x={x}
                  y={y + 5}
                  textAnchor="middle"
                  fontSize="13"
                  fontWeight="700"
                  fill="white"
                  fontFamily="system-ui"
                >
                  {(item.name?.[0] ?? "?").toUpperCase()}
                </text>

                <rect
                  x={x - 48}
                  y={y + 30}
                  width="96"
                  height="18"
                  rx="8"
                  fill="rgba(0,0,0,0.6)"
                />
                <text
                  x={x}
                  y={y + 42}
                  textAnchor="middle"
                  fontSize="10"
                  fontWeight="600"
                  fill="rgba(255,255,255,0.88)"
                  fontFamily="system-ui"
                >
                  {item.name.split(" ")[0]}
                </text>
              </g>
            );
          })}

          <g>
            <circle
              cx="440"
              cy="220"
              r="36"
              fill="#ff8f84"
              fillOpacity="0.18"
            />
            <circle cx="440" cy="220" r="28" fill="#ff8f84" />
            <text
              x="440"
              y="226"
              textAnchor="middle"
              fontSize="14"
              fontWeight="700"
              fill="white"
              fontFamily="system-ui"
            >
              YOU
            </text>
            <rect
              x="384"
              y="258"
              width="112"
              height="20"
              rx="9"
              fill="rgba(0,0,0,0.62)"
            />
            <text
              x="440"
              y="272"
              textAnchor="middle"
              fontSize="10"
              fontWeight="600"
              fill="rgba(255,255,255,0.9)"
              fontFamily="system-ui"
            >
              {currentUserName.split(" ")[0]}
            </text>
          </g>

          {chartConnections.length === 0 ? (
            <text
              x="440"
              y="52"
              textAnchor="middle"
              fontSize="12"
              fontWeight="600"
              fill="rgba(255,255,255,0.52)"
              fontFamily="system-ui"
            >
              Add your first direct connection to start your network
            </text>
          ) : null}
        </svg>
        <p className="border-t border-white/10 px-4 py-3 text-center text-xs text-white/55">
          The more people you add, the more connections you uncover.
        </p>
      </section>

      {/* Confirmed direct connections */}
      {approvedConnections.length > 0
        ? (() => {
            const usersById = new Map(users.map((u) => [u.id, u]));
            return (
              <div
                className="rounded-2xl p-4"
                style={{
                  background: "#0f0819",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <p className="mb-3 text-xs font-bold uppercase tracking-wider text-white/50">
                  Confirmed direct connections
                </p>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {approvedConnections.map((rel) => {
                    const otherId =
                      rel.source === currentUserId ? rel.target : rel.source;
                    const other = usersById.get(otherId);
                    if (!other) return null;
                    const color = TYPE_COLORS[rel.type] ?? "#888";
                    const initial = (other.name?.[0] ?? "?").toUpperCase();
                    return (
                      <div
                        key={rel.id}
                        className="flex items-center gap-3 rounded-2xl p-3"
                        style={{
                          background: "rgba(255,255,255,0.04)",
                          border: "1px solid rgba(255,255,255,0.09)",
                          boxShadow: `0 0 0 1px ${color}22 inset`,
                        }}
                      >
                        <div
                          style={{
                            width: 38,
                            height: 38,
                            flexShrink: 0,
                            borderRadius: "50%",
                            background: `radial-gradient(circle at 38% 32%, ${color} 0%, color-mix(in srgb, ${color}, #000 28%) 100%)`,
                            boxShadow: `0 0 12px ${color}44`,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            border: "2px solid rgba(255,255,255,0.12)",
                          }}
                        >
                          <span
                            style={{
                              color: "white",
                              fontWeight: 700,
                              fontSize: 13,
                              fontFamily: "system-ui",
                            }}
                          >
                            {initial}
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-white">
                            {other.name}
                          </p>
                          <span
                            className="mt-0.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
                            style={{
                              backgroundColor: `${color}33`,
                              color,
                              border: `1px solid ${color}55`,
                            }}
                          >
                            {rel.type}
                          </span>
                        </div>
                        <span className="shrink-0 rounded-full bg-green-500/20 px-2 py-0.5 text-[10px] font-semibold text-green-400">
                          Confirmed
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()
        : null}

      <div className="flex items-start gap-3 rounded-2xl border border-[var(--border-soft)] bg-black/[0.03] px-4 py-3 dark:bg-white/5">
        <span className="mt-0.5 text-lg">🔒</span>
        <div>
          <p className="text-sm font-semibold">
            Placeholder nodes stay private to you
          </p>
          <p className="mt-0.5 text-xs text-black/60 dark:text-white/60">
            Add someone before they have an account, then invite them or let
            them claim the node later. Contact details are optional and only
            used to suggest safe matches.
          </p>
        </div>
      </div>

      {/* Add-connection form */}
      <div className="paper-card rounded-2xl p-5">
        <h3 className="text-sm font-bold uppercase tracking-wider">
          Add to your private chart (step 1)
        </h3>
        <p className="mt-2 text-xs text-black/65 dark:text-white/65">
          New entries start as private placeholders (dashed line). They become
          part of the confirmed network after invite + verification.
        </p>
        <form className="mt-3 space-y-3" onSubmit={handleAdd}>
          <input
            type="text"
            value={addName}
            onChange={(e) => setAddName(e.target.value)}
            placeholder="Name (required)"
            maxLength={80}
            className="w-full rounded-xl border border-[var(--border-soft)] bg-transparent px-3 py-2.5 text-sm outline-none placeholder:text-black/40 dark:placeholder:text-white/40"
            disabled={isAdding}
          />
          <div className="grid gap-2 md:grid-cols-2">
            <input
              type="email"
              value={addEmail}
              onChange={(e) => setAddEmail(e.target.value)}
              placeholder="Email (optional)"
              maxLength={200}
              className="w-full rounded-xl border border-[var(--border-soft)] bg-transparent px-3 py-2.5 text-sm outline-none placeholder:text-black/40 dark:placeholder:text-white/40"
              disabled={isAdding}
            />
            <input
              type="text"
              value={addPhoneNumber}
              onChange={(e) => setAddPhoneNumber(e.target.value)}
              placeholder="Phone (optional)"
              maxLength={40}
              className="w-full rounded-xl border border-[var(--border-soft)] bg-transparent px-3 py-2.5 text-sm outline-none placeholder:text-black/40 dark:placeholder:text-white/40"
              disabled={isAdding}
            />
          </div>
          <div className="flex gap-2">
            <select
              value={addType}
              onChange={(e) => setAddType(e.target.value as RelationshipType)}
              className="flex-1 rounded-xl border border-[var(--border-soft)] bg-transparent px-3 py-2.5 text-sm outline-none"
              disabled={isAdding}
            >
              {ALL_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <p className="-mt-1 text-[11px] text-black/55 dark:text-white/55">
            Relationship type controls color/tagging in your chart.
          </p>
          <input
            type="text"
            value={addNote}
            onChange={(e) => setAddNote(e.target.value)}
            placeholder="Add a note (optional)"
            maxLength={500}
            className="w-full rounded-xl border border-[var(--border-soft)] bg-transparent px-3 py-2.5 text-sm outline-none placeholder:text-black/40 dark:placeholder:text-white/40"
            disabled={isAdding}
          />
          {addError ? (
            <p className="text-xs text-red-700 dark:text-red-400">{addError}</p>
          ) : null}
          {addHint ? (
            <p className="text-xs text-amber-700 dark:text-amber-300">
              {addHint}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={isAdding || !addName.trim()}
            className="w-full rounded-xl bg-[var(--accent)] py-2.5 text-sm font-bold text-white disabled:opacity-60"
          >
            {isAdding ? "Adding..." : "Add private connection"}
          </button>
          <p className="text-[11px] text-black/55 dark:text-white/55">
            After adding, use <strong>Generate invite</strong> on their card to
            start confirmation.
          </p>
        </form>
      </div>

      {actionError ? (
        <p className="text-xs text-red-700 dark:text-red-400">{actionError}</p>
      ) : null}
      {actionMessage ? (
        <p className="text-xs text-green-700 dark:text-green-400">
          {actionMessage}
        </p>
      ) : null}

      {/* Placeholder cards grid */}
      {placeholders.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/10 p-10 text-center"
          style={{ background: "#0f0819" }}
        >
          <p className="text-3xl">👀</p>
          <p className="mt-2 text-sm font-semibold text-white/80">
            Your direct network is empty
          </p>
          <p className="mt-1 text-xs text-white/40">
            Start adding people above. They can claim their node later or verify
            the connection after signup.
          </p>
        </div>
      ) : (
        <div
          className="rounded-2xl p-4"
          style={{
            background: "#0f0819",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {placeholders.map((p) => {
              const color = TYPE_COLORS[p.relationshipType] ?? "#888";
              const statusLabel = STATUS_LABELS[p.claimStatus] ?? p.claimStatus;
              const isWorking = workingId === p.id;
              const isEditing = editingId === p.id;
              const isCopied = copiedId === p.id;
              const inviteLink = p.inviteToken
                ? `${baseUrl}/invite/${p.inviteToken}`
                : null;
              const isOwned =
                currentUserId !== null && p.ownerId === currentUserId;
              const initial = (p.name?.[0] ?? "?").toUpperCase();
              const publicConnectCandidate =
                publicConnectCandidates[p.id] ?? null;
              const isPublicConnecting = publicConnectingPlaceholderId === p.id;

              return (
                <div
                  key={p.id}
                  className="rounded-2xl p-4"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: `1px solid rgba(255,255,255,0.09)`,
                    boxShadow: `0 0 0 1px ${color}22 inset`,
                  }}
                >
                  {isEditing ? (
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        maxLength={80}
                        className="w-full rounded-lg border border-white/15 bg-white/8 px-2 py-1.5 text-sm text-white outline-none placeholder:text-white/30"
                      />
                      <select
                        value={editType}
                        onChange={(e) =>
                          setEditType(e.target.value as RelationshipType)
                        }
                        className="w-full rounded-lg border border-white/15 bg-white/8 px-2 py-1.5 text-xs text-white outline-none"
                      >
                        {ALL_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                      <input
                        type="email"
                        value={editEmail}
                        onChange={(e) => setEditEmail(e.target.value)}
                        maxLength={200}
                        placeholder="Email (optional)"
                        className="w-full rounded-lg border border-white/15 bg-white/8 px-2 py-1.5 text-xs text-white outline-none placeholder:text-white/30"
                      />
                      <input
                        type="text"
                        value={editPhoneNumber}
                        onChange={(e) => setEditPhoneNumber(e.target.value)}
                        maxLength={40}
                        placeholder="Phone (optional)"
                        className="w-full rounded-lg border border-white/15 bg-white/8 px-2 py-1.5 text-xs text-white outline-none placeholder:text-white/30"
                      />
                      <input
                        type="text"
                        value={editNote}
                        onChange={(e) => setEditNote(e.target.value)}
                        maxLength={500}
                        placeholder="Note (optional)"
                        className="w-full rounded-lg border border-white/15 bg-white/8 px-2 py-1.5 text-xs text-white outline-none placeholder:text-white/30"
                      />
                      {editError ? (
                        <p className="text-xs text-red-400">{editError}</p>
                      ) : null}
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleSaveEdit(p.id)}
                          disabled={isSaving}
                          className="rounded-full bg-[var(--accent)] px-3 py-1 text-xs font-semibold text-white disabled:opacity-60"
                        >
                          {isSaving ? "Saving…" : "Save"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="rounded-full border border-white/15 px-3 py-1 text-xs font-semibold text-white/70"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Header — avatar + name + status */}
                      <div className="flex items-start gap-3">
                        {/* Circle avatar */}
                        <div
                          className="shrink-0"
                          style={{
                            width: 40,
                            height: 40,
                            borderRadius: "50%",
                            background: `radial-gradient(circle at 38% 32%, ${color} 0%, color-mix(in srgb, ${color}, #000 28%) 100%)`,
                            boxShadow: `0 0 14px ${color}44, 0 3px 8px rgba(0,0,0,0.4)`,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            border: "2px solid rgba(255,255,255,0.12)",
                          }}
                        >
                          <span
                            style={{
                              color: "white",
                              fontWeight: 700,
                              fontSize: 14,
                              fontFamily: "system-ui",
                            }}
                          >
                            {initial}
                          </span>
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-1">
                            <p className="truncate font-semibold leading-snug text-white">
                              {p.name}
                            </p>
                            <span
                              className={`shrink-0 mt-0.5 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                p.claimStatus === "claimed"
                                  ? "bg-green-500/20 text-green-400"
                                  : p.claimStatus === "denied"
                                    ? "bg-red-500/20 text-red-400"
                                    : p.claimStatus === "invited"
                                      ? "bg-amber-500/20 text-amber-400"
                                      : "bg-white/10 text-white/55"
                              }`}
                            >
                              {statusLabel}
                            </span>
                          </div>
                          <span
                            className="mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white"
                            style={{
                              backgroundColor: `${color}33`,
                              color,
                              border: `1px solid ${color}55`,
                            }}
                          >
                            {p.relationshipType}
                          </span>
                          {publicConnectCandidate ? (
                            <span className="ml-2 mt-1 inline-block rounded-full border border-amber-300/45 bg-amber-400/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-200">
                              Existing user match
                            </span>
                          ) : null}
                        </div>
                      </div>

                      {p.note ? (
                        <p className="mt-2 text-xs italic text-white/50">
                          &quot;{p.note}&quot;
                        </p>
                      ) : null}

                      {p.email || p.phoneNumber ? (
                        <div className="mt-2 space-y-1 text-[11px] text-white/45">
                          {p.email ? <p>{p.email}</p> : null}
                          {p.phoneNumber ? <p>{p.phoneNumber}</p> : null}
                        </div>
                      ) : null}

                      {!isOwned ? (
                        <p className="mt-2 text-[11px] text-white/40">
                          Only the person who created this entry can edit it.
                        </p>
                      ) : null}

                      {/* Invite link display */}
                      {inviteLink &&
                      p.claimStatus !== "claimed" &&
                      p.claimStatus !== "denied" ? (
                        <div className="mt-3 flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2.5 py-2">
                          <p className="min-w-0 flex-1 truncate text-[10px] text-white/40">
                            {inviteLink}
                          </p>
                          <button
                            type="button"
                            onClick={() => copyInviteLink(p)}
                            className="shrink-0 rounded-full bg-[var(--accent)] px-2.5 py-1 text-[10px] font-bold text-white"
                          >
                            {isCopied ? "Copied!" : "Copy"}
                          </button>
                        </div>
                      ) : null}

                      {/* Action buttons */}
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {isOwned &&
                        p.claimStatus !== "claimed" &&
                        p.claimStatus !== "denied" ? (
                          <>
                            {!p.inviteToken ? (
                              <button
                                type="button"
                                onClick={() => handleGenerateInvite(p.id)}
                                disabled={isWorking}
                                className="rounded-full border border-white/15 px-3 py-1 text-[11px] font-semibold text-white/70 transition hover:border-white/30 hover:text-white disabled:opacity-60"
                              >
                                Generate invite
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleRevokeInvite(p.id)}
                                disabled={isWorking}
                                className="rounded-full border border-white/15 px-3 py-1 text-[11px] font-semibold text-white/50 transition hover:border-white/30 hover:text-white/70 disabled:opacity-60"
                              >
                                Revoke link
                              </button>
                            )}
                          </>
                        ) : null}

                        {isOwned ? (
                          <>
                            {publicConnectCandidate &&
                            p.claimStatus !== "claimed" &&
                            p.claimStatus !== "denied" ? (
                              <button
                                type="button"
                                onClick={() =>
                                  handleConnectPublicly(publicConnectCandidate)
                                }
                                disabled={
                                  isWorking ||
                                  isPublicConnecting ||
                                  !currentUserId
                                }
                                className="rounded-full border border-[var(--accent)]/50 bg-[var(--accent)]/15 px-3 py-1 text-[11px] font-semibold text-[var(--accent)] transition hover:brightness-110 disabled:opacity-60"
                              >
                                {isPublicConnecting
                                  ? "Sending..."
                                  : `Connect publicly with ${publicConnectCandidate.name}`}
                              </button>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => startEdit(p)}
                              disabled={isWorking}
                              className="rounded-full border border-white/15 px-3 py-1 text-[11px] font-semibold text-white/70 transition hover:border-white/30 hover:text-white disabled:opacity-60"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(p.id)}
                              disabled={isWorking}
                              className="rounded-full border border-red-500/30 px-3 py-1 text-[11px] font-semibold text-red-400 transition hover:bg-red-500/10 disabled:opacity-60"
                            >
                              {isWorking ? "…" : "Remove"}
                            </button>
                          </>
                        ) : null}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
