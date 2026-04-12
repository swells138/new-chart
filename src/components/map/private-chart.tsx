"use client";

import { useState } from "react";
import type { PlaceholderPerson, Relationship, RelationshipType, User } from "@/types/models";

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
  unclaimed: "Not sent",
  invited: "Invite sent 👀",
  claimed: "Accepted ✓",
  denied: "Declined",
};

interface Props {
  initialPlaceholders: PlaceholderPerson[];
  baseUrl: string;
  currentUserId: string | null;
  approvedConnections?: Relationship[];
  users?: User[];
}

export function PrivateChart({ initialPlaceholders, baseUrl, currentUserId, approvedConnections = [], users = [] }: Props) {
  const [placeholders, setPlaceholders] = useState<PlaceholderPerson[]>(initialPlaceholders);

  // Add-form state
  const [addName, setAddName] = useState("");
  const [addType, setAddType] = useState<RelationshipType>("Friends");
  const [addNote, setAddNote] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState<RelationshipType>("Friends");
  const [editNote, setEditNote] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Invite/action state
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const name = addName.trim();
    if (!name) {
      setAddError("A name is required.");
      return;
    }
    setIsAdding(true);
    setAddError(null);

    try {
      const res = await fetch("/api/private-connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, relationshipType: addType, note: addNote.trim() || undefined }),
      });
      const body = (await res.json()) as { placeholder?: PlaceholderPerson; error?: string };
      if (!res.ok || !body.placeholder) {
        setAddError(body.error ?? "Could not add that connection.");
        return;
      }
      setPlaceholders((prev) => [body.placeholder!, ...prev]);
      setAddName("");
      setAddNote("");
    } catch {
      setAddError("Could not add that connection.");
    } finally {
      setIsAdding(false);
    }
  }

  async function handleGenerateInvite(id: string) {
    setWorkingId(id);
    try {
      const res = await fetch("/api/private-connections", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "generateInvite" }),
      });
      const body = (await res.json()) as { placeholder?: PlaceholderPerson; error?: string };
      if (body.placeholder) {
        setPlaceholders((prev) => prev.map((p) => (p.id === id ? body.placeholder! : p)));
      }
    } finally {
      setWorkingId(null);
    }
  }

  async function handleRevokeInvite(id: string) {
    setWorkingId(id);
    try {
      const res = await fetch("/api/private-connections", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "revokeInvite" }),
      });
      const body = (await res.json()) as { placeholder?: PlaceholderPerson; error?: string };
      if (body.placeholder) {
        setPlaceholders((prev) => prev.map((p) => (p.id === id ? body.placeholder! : p)));
      }
    } finally {
      setWorkingId(null);
    }
  }

  async function handleDelete(id: string) {
    setWorkingId(id);
    try {
      const res = await fetch("/api/private-connections", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        setPlaceholders((prev) => prev.filter((p) => p.id !== id));
        if (editingId === id) setEditingId(null);
      }
    } finally {
      setWorkingId(null);
    }
  }

  function startEdit(p: PlaceholderPerson) {
    setEditingId(p.id);
    setEditName(p.name);
    setEditType(p.relationshipType);
    setEditNote(p.note);
    setEditError(null);
  }

  async function handleSaveEdit(id: string) {
    setIsSaving(true);
    setEditError(null);
    try {
      const res = await fetch("/api/private-connections", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          action: "update",
          name: editName.trim(),
          relationshipType: editType,
          note: editNote.trim() || undefined,
        }),
      });
      const body = (await res.json()) as { placeholder?: PlaceholderPerson; error?: string };
      if (!res.ok || !body.placeholder) {
        setEditError(body.error ?? "Could not save changes.");
        return;
      }
      setPlaceholders((prev) => prev.map((p) => (p.id === id ? body.placeholder! : p)));
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
    setTimeout(() => setCopiedId((prev) => (prev === p.id ? null : prev)), 2000);
  }

  return (
    <div className="space-y-6">
      {/* Privacy banner */}

      {/* Public approved connections — read-only display */}
      {approvedConnections.length > 0 ? (() => {
        const usersById = new Map(users.map((u) => [u.id, u]));
        return (
          <div
            className="rounded-2xl p-4"
            style={{ background: "#0f0819", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            <p className="mb-3 text-xs font-bold uppercase tracking-wider text-white/50">
              Public approved connections
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {approvedConnections.map((rel) => {
                const otherId = rel.source === currentUserId ? rel.target : rel.source;
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
                      <span style={{ color: "white", fontWeight: 700, fontSize: 13, fontFamily: "system-ui" }}>
                        {initial}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-white">{other.name}</p>
                      <span
                        className="mt-0.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
                        style={{ backgroundColor: `${color}33`, color, border: `1px solid ${color}55` }}
                      >
                        {rel.type}
                      </span>
                    </div>
                    <span className="shrink-0 rounded-full bg-green-500/20 px-2 py-0.5 text-[10px] font-semibold text-green-400">
                      Public ✓
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })() : null}

      <div className="flex items-start gap-3 rounded-2xl border border-[var(--border-soft)] bg-black/[0.03] px-4 py-3 dark:bg-white/5">
        <span className="mt-0.5 text-lg">🔒</span>
        <div>
          <p className="text-sm font-semibold">Only visible to you</p>
          <p className="mt-0.5 text-xs text-black/60 dark:text-white/60">
            People you add here are private. Nothing appears publicly unless you and the other
            person both consent. No email or phone required to add someone.
          </p>
        </div>
      </div>

      {/* Add-connection form */}
      <div className="paper-card rounded-2xl p-5">
        <h3 className="text-sm font-bold uppercase tracking-wider">Add to private chart</h3>
        <form className="mt-3 space-y-3" onSubmit={handleAdd}>
          <input
            type="text"
            value={addName}
            onChange={(e) => setAddName(e.target.value)}
            placeholder="Their name (no account needed)"
            maxLength={80}
            className="w-full rounded-xl border border-[var(--border-soft)] bg-transparent px-3 py-2.5 text-sm outline-none placeholder:text-black/40 dark:placeholder:text-white/40"
            disabled={isAdding}
          />
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
          <button
            type="submit"
            disabled={isAdding || !addName.trim()}
            className="w-full rounded-xl bg-[var(--accent)] py-2.5 text-sm font-bold text-white disabled:opacity-60"
          >
            {isAdding ? "Adding…" : "Add to private chart"}
          </button>
        </form>
      </div>

      {/* Placeholder cards grid */}
      {placeholders.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/10 p-10 text-center"
          style={{ background: "#0f0819" }}
        >
          <p className="text-3xl">👀</p>
          <p className="mt-2 text-sm font-semibold text-white/80">Your chart is empty</p>
          <p className="mt-1 text-xs text-white/40">
            Start adding people above — no account, no email, no drama.
          </p>
        </div>
      ) : (
        <div
          className="rounded-2xl p-4"
          style={{ background: "#0f0819", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {placeholders.map((p) => {
            const color = TYPE_COLORS[p.relationshipType] ?? "#888";
            const statusLabel = STATUS_LABELS[p.claimStatus] ?? p.claimStatus;
            const isWorking = workingId === p.id;
            const isEditing = editingId === p.id;
            const isCopied = copiedId === p.id;
            const inviteLink = p.inviteToken ? `${baseUrl}/invite/${p.inviteToken}` : null;
            const isOwned = currentUserId !== null && p.ownerId === currentUserId;
            const initial = (p.name?.[0] ?? "?").toUpperCase();

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
                      onChange={(e) => setEditType(e.target.value as RelationshipType)}
                      className="w-full rounded-lg border border-white/15 bg-white/8 px-2 py-1.5 text-xs text-white outline-none"
                    >
                      {ALL_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
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
                        <span style={{ color: "white", fontWeight: 700, fontSize: 14, fontFamily: "system-ui" }}>
                          {initial}
                        </span>
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-1">
                          <p className="truncate font-semibold leading-snug text-white">{p.name}</p>
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
                          style={{ backgroundColor: `${color}33`, color, border: `1px solid ${color}55` }}
                        >
                          {p.relationshipType}
                        </span>
                      </div>
                    </div>

                    {p.note ? (
                      <p className="mt-2 text-xs italic text-white/50">
                        &quot;{p.note}&quot;
                      </p>
                    ) : null}

                    {!isOwned ? (
                      <p className="mt-2 text-[11px] text-white/40">
                        Only the person who created this entry can edit it.
                      </p>
                    ) : null}

                    {/* Invite link display */}
                    {inviteLink && p.claimStatus !== "claimed" && p.claimStatus !== "denied" ? (
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
                      {isOwned && p.claimStatus !== "claimed" && p.claimStatus !== "denied" ? (
                        <>
                          {!p.inviteToken ? (
                            <button
                              type="button"
                              onClick={() => handleGenerateInvite(p.id)}
                              disabled={isWorking}
                              className="rounded-full border border-white/15 px-3 py-1 text-[11px] font-semibold text-white/70 transition hover:border-white/30 hover:text-white disabled:opacity-60"
                            >
                              Generate invite 🔗
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
