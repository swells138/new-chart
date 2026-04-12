"use client";

import {
  Background,
  type Connection,
  Controls,
  ReactFlow,
  type Edge,
  type Node,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useEffect, useMemo, useState } from "react";
import type { Relationship, RelationshipType, User } from "@/types/models";
import { Avatar } from "@/components/ui/avatar";

const relationColors: Record<RelationshipType, string> = {
  Exes: "#ff8f84",
  Married: "#e85d8d",
  "Sneaky Link": "#9b8cff",
  Friends: "#66b6a7",
  Lovers: "#ee82d8",
  "One Night Stand": "#ffbb6f",
  complicated: "#7aa2ff",
  FWB: "#63b1ff",
};

interface Props {
  users: User[];
  relationships: Relationship[];
  currentUserId: string | null;
  userConnections?: Relationship[];
  areaUsers?: User[];
  currentUserLocation?: string | null;
}

type ApprovalStatus = "approved" | "pending";

const metaPrefix = "[[meta:";
const metaSuffix = "]]";

function parseRelationshipNote(input: string): {
  status: ApprovalStatus;
  requesterId: string | null;
  responderId: string | null;
  note: string;
} {
  const raw = input ?? "";

  if (!raw.startsWith(metaPrefix)) {
    return {
      status: "approved",
      requesterId: null,
      responderId: null,
      note: raw,
    };
  }

  const endIndex = raw.indexOf(metaSuffix);
  if (endIndex === -1) {
    return {
      status: "approved",
      requesterId: null,
      responderId: null,
      note: raw,
    };
  }

  try {
    const meta = JSON.parse(raw.slice(metaPrefix.length, endIndex)) as {
      status?: string;
      requesterId?: string;
      responderId?: string;
    };

    return {
      status: meta.status === "pending" ? "pending" : "approved",
      requesterId: typeof meta.requesterId === "string" ? meta.requesterId : null,
      responderId: typeof meta.responderId === "string" ? meta.responderId : null,
      note: raw.slice(endIndex + metaSuffix.length).trim(),
    };
  } catch {
    return {
      status: "approved",
      requesterId: null,
      responderId: null,
      note: raw,
    };
  }
}

export function RelationshipMap({ users, relationships, currentUserId, userConnections, areaUsers, currentUserLocation }: Props) {
  const [activeTypes, setActiveTypes] = useState<RelationshipType[]>([
    "Exes",
    "Married",
    "Sneaky Link",
    "Friends",
    "Lovers",
    "One Night Stand",
    "complicated",
    "FWB",
  ]);
  const [showConnections, setShowConnections] = useState(Boolean(userConnections && userConnections.length > 0));
  const [selectedId, setSelectedId] = useState<string | null>(users[0]?.id ?? null);
  const [connectionTargetId, setConnectionTargetId] = useState<string>("");
  const [connectionQuery, setConnectionQuery] = useState<string>("");
  const [connectionType, setConnectionType] = useState<RelationshipType>("Friends");
  const [allRelationships, setAllRelationships] = useState<Relationship[]>(relationships);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [editingRelationshipId, setEditingRelationshipId] = useState<string | null>(null);
  const [editingType, setEditingType] = useState<RelationshipType>("Friends");
  const [editingNote, setEditingNote] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isRespondingId, setIsRespondingId] = useState<string | null>(null);

  const scopedRelationships = useMemo(() => {
    const byId = new Map<string, Relationship>();

    relationships.forEach((item) => {
      byId.set(item.id, item);
    });

    if (currentUserId && userConnections) {
      userConnections.forEach((item) => {
        if (item.source === currentUserId || item.target === currentUserId) {
          byId.set(item.id, item);
        }
      });
    }

    return Array.from(byId.values());
  }, [relationships, userConnections, currentUserId]);

  useEffect(() => {
    setAllRelationships(scopedRelationships);
  }, [scopedRelationships]);

  const approvedUserConnections = useMemo(
    () =>
      allRelationships.filter((item) => {
        const parsed = parseRelationshipNote(item.note);
        if (parsed.status !== "approved") {
          return false;
        }
        if (!currentUserId) {
          return false;
        }
        return item.source === currentUserId || item.target === currentUserId;
      }),
    [allRelationships, currentUserId]
  );

  const connectedNodeIds = useMemo(() => {
    if (!currentUserId) {
      return new Set<string>();
    }

    const ids = new Set<string>([currentUserId]);

    approvedUserConnections.forEach((item) => {
      if (item.source === currentUserId) {
        ids.add(item.target);
      } else if (item.target === currentUserId) {
        ids.add(item.source);
      }
    });

    return ids;
  }, [approvedUserConnections, currentUserId]);

  // Determine which users to display based on view mode
  const displayedUsers = useMemo(() => {
    if (showConnections) {
      return users.filter((user) => connectedNodeIds.has(user.id));
    }

    // If showing area view, use area users if available, otherwise show all
    if (areaUsers && areaUsers.length > 0) {
      return areaUsers;
    }

    return users;
  }, [showConnections, users, areaUsers, connectedNodeIds]);

  useEffect(() => {
    if (displayedUsers.length === 0) {
      setSelectedId(null);
      return;
    }

    if (selectedId && displayedUsers.some((user) => user.id === selectedId)) {
      return;
    }

    const defaultSelected =
      (currentUserId && displayedUsers.find((user) => user.id === currentUserId)?.id) ?? displayedUsers[0].id;
    setSelectedId(defaultSelected);
  }, [displayedUsers, selectedId, currentUserId]);

  const displayedUserIds = useMemo(() => new Set(displayedUsers.map((user) => user.id)), [displayedUsers]);

  const connectableUsers = useMemo(() => {
    if (!currentUserId) {
      return [] as User[];
    }

    return users.filter((user) => {
      if (user.id === currentUserId) {
        return false;
      }

      const alreadyConnected = allRelationships.some(
        (item) =>
          (item.source === currentUserId && item.target === user.id) ||
          (item.source === user.id && item.target === currentUserId)
      );

      return !alreadyConnected;
    });
  }, [users, currentUserId, allRelationships]);

  const filteredConnectableUsers = useMemo(() => {
    const query = connectionQuery.trim().toLowerCase();
    if (!query) {
      return connectableUsers;
    }

    return connectableUsers.filter(
      (user) =>
        user.name.toLowerCase().includes(query) ||
        user.handle.toLowerCase().includes(query) ||
        user.location.toLowerCase().includes(query)
    );
  }, [connectableUsers, connectionQuery]);

  const selectedConnectionTarget = useMemo(
    () => connectableUsers.find((user) => user.id === connectionTargetId) ?? null,
    [connectableUsers, connectionTargetId]
  );

  useEffect(() => {
    if (connectableUsers.length === 0) {
      setConnectionTargetId("");
      return;
    }

    if (connectableUsers.some((user) => user.id === connectionTargetId)) {
      return;
    }

    setConnectionTargetId(connectableUsers[0].id);
  }, [connectableUsers, connectionTargetId]);

  // Determine which relationships to display
  const displayedRelationships = useMemo(
    () => (showConnections ? approvedUserConnections : allRelationships),
    [showConnections, approvedUserConnections, allRelationships]
  );

  const mappedNodes: Node[] = useMemo(
    () =>
      displayedUsers.map((user, index) => ({
        id: user.id,
        data: { label: `${user.name}\n@${user.handle}` },
        position: {
          x: 120 + (index % 3) * 250,
          y: 80 + Math.floor(index / 3) * 180,
        },
        style: {
          borderRadius: 20,
          padding: 8,
          border: "1px solid var(--border-soft)",
          background: "var(--card)",
          width: 150,
          whiteSpace: "pre-line",
          fontSize: "12px",
        },
        draggable: currentUserId ? user.id === currentUserId : false,
      })),
    [displayedUsers, currentUserId]
  );

  const filteredRelationships = useMemo(
    () => {
      return displayedRelationships.filter(
        (item) =>
          activeTypes.includes(item.type) &&
          displayedUserIds.has(item.source) &&
          displayedUserIds.has(item.target)
      );
    },
    [activeTypes, displayedRelationships, displayedUserIds]
  );

  const graphRelationships = useMemo(
    () => filteredRelationships.filter((item) => parseRelationshipNote(item.note).status === "approved"),
    [filteredRelationships]
  );

  const mappedEdges: Edge[] = useMemo(
    () =>
      graphRelationships.map((item) => ({
        id: item.id,
        source: item.source,
        target: item.target,
        label: item.type,
        style: {
          stroke: relationColors[item.type],
          strokeWidth: 2,
        },
        labelStyle: {
          fontSize: 10,
          fill: relationColors[item.type],
          textTransform: "uppercase",
        },
      })),
    [graphRelationships]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(mappedNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(mappedEdges);

  useEffect(() => {
    setNodes(mappedNodes);
  }, [mappedNodes, setNodes]);

  useEffect(() => {
    setEdges(mappedEdges);
  }, [mappedEdges, setEdges]);

  async function createConnection(targetId: string) {
    if (!targetId) {
      setConnectionError("Choose someone to connect with.");
      return;
    }

    if (!currentUserId) {
      setConnectionError("Sign in to create connections.");
      return;
    }

    const sourceId = currentUserId;

    if (sourceId === targetId) {
      setConnectionError("A user cannot connect to themselves.");
      return;
    }

    const duplicate = allRelationships.some(
      (item) =>
        (item.source === sourceId && item.target === targetId) ||
        (item.source === targetId && item.target === sourceId)
    );

    if (duplicate) {
      setConnectionError("These users are already connected.");
      return;
    }

    setIsConnecting(true);
    setConnectionError(null);

    try {
      const response = await fetch("/api/relationships", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          source: sourceId,
          target: targetId,
          type: connectionType,
        }),
      });

      const body = (await response.json()) as {
        error?: string;
        relationship?: Relationship;
      };

      if (!response.ok || !body.relationship) {
        setConnectionError(body.error ?? "Could not create that connection.");
        return;
      }

      const relationship = body.relationship;

      setAllRelationships((prev) => [...prev, relationship]);
      setSelectedId(relationship.target);
    } catch (error) {
      console.error(error);
      setConnectionError("Could not create that connection.");
    } finally {
      setIsConnecting(false);
    }
  }

  async function onConnect(connection: Connection) {
    if (!connection.source || !connection.target) {
      return;
    }

    if (!currentUserId) {
      setConnectionError("Sign in to create connections.");
      return;
    }

    if (connection.source !== currentUserId) {
      setConnectionError("You can only create connections from your own node.");
      return;
    }

    await createConnection(connection.target);
  }

  function startEditing(item: Relationship) {
    const parsed = parseRelationshipNote(item.note);
    setEditingRelationshipId(item.id);
    setEditingType(item.type);
    setEditingNote(parsed.note);
    setConnectionError(null);
  }

  function cancelEditing() {
    setEditingRelationshipId(null);
    setEditingNote("");
  }

  async function saveRelationshipEdit(id: string) {
    setIsSavingEdit(true);
    setConnectionError(null);

    try {
      const response = await fetch("/api/relationships", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id,
          type: editingType,
          note: editingNote,
          actorNodeId: currentUserId,
        }),
      });

      const body = (await response.json()) as {
        error?: string;
        relationship?: Relationship;
      };

      if (!response.ok || !body.relationship) {
        setConnectionError(body.error ?? "Could not update that connection.");
        return;
      }

      const updated = body.relationship;

      setAllRelationships((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      setEditingRelationshipId(null);
    } catch (error) {
      console.error(error);
      setConnectionError("Could not update that connection.");
    } finally {
      setIsSavingEdit(false);
    }
  }

  async function respondToConnection(id: string, action: "approve" | "reject") {
    setIsRespondingId(id);
    setConnectionError(null);

    try {
      const response = await fetch("/api/relationships", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id, action, actorNodeId: currentUserId }),
      });

      const body = (await response.json()) as {
        error?: string;
        deleted?: boolean;
        relationship?: Relationship;
        id?: string;
      };

      if (!response.ok) {
        setConnectionError(body.error ?? "Could not update the request.");
        return;
      }

      if (body.deleted && body.id) {
        setAllRelationships((prev) => prev.filter((item) => item.id !== body.id));
        return;
      }

      if (body.relationship) {
        setAllRelationships((prev) =>
          prev.map((item) => (item.id === body.relationship?.id ? body.relationship : item))
        );
      }
    } catch (error) {
      console.error(error);
      setConnectionError("Could not update the request.");
    } finally {
      setIsRespondingId(null);
    }
  }

  const selectedUser = displayedUsers.find((user) => user.id === selectedId);
  const selectedConnections = filteredRelationships.filter(
    (item) => item.source === selectedId || item.target === selectedId
  );
  const pendingRequests = useMemo(() => {
    if (!currentUserId) {
      return [] as Relationship[];
    }

    return allRelationships.filter((item) => {
      const parsed = parseRelationshipNote(item.note);
      if (parsed.status !== "pending") {
        return false;
      }
      return parsed.requesterId === currentUserId || parsed.responderId === currentUserId;
    });
  }, [allRelationships, currentUserId]);

  return (
    <div className="grid gap-4 lg:grid-cols-[1.5fr_0.9fr]">
      <section className="paper-card rounded-2xl p-4">
        <div className="mb-3 flex flex-wrap gap-2">
          {(Object.keys(relationColors) as RelationshipType[]).map((type) => {
            const active = activeTypes.includes(type);
            return (
              <button
                type="button"
                key={type}
                onClick={() =>
                  setActiveTypes((prev) =>
                    prev.includes(type) ? prev.filter((item) => item !== type) : [...prev, type]
                  )
                }
                className="rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide transition"
                style={{
                  borderColor: active ? relationColors[type] : "var(--border-soft)",
                  backgroundColor: active ? `${relationColors[type]}20` : "transparent",
                }}
              >
                {type}
              </button>
            );
          })}
        </div>
        <p className="mb-3 text-xs text-black/65 dark:text-white/70">
          Use the side form to create a connection, or drag from your node to another member.
        </p>
        {currentUserId ? null : (
          <p className="mb-3 text-xs text-black/65 dark:text-white/70">
            Sign in to create and edit your own connections.
          </p>
        )}
        {connectionError ? (
          <p className="mb-3 text-sm text-red-700 dark:text-red-400">{connectionError}</p>
        ) : null}
        <div className="relative h-[520px] overflow-hidden rounded-2xl border border-[var(--border-soft)] bg-white/40 dark:bg-black/20">
          {userConnections && userConnections.length > 0 && areaUsers && areaUsers.length > 0 ? (
            <div className="absolute top-3 right-3 z-20">
              <div className="flex items-center rounded-xl border border-[var(--border-soft)] bg-white/90 p-1 shadow-sm backdrop-blur dark:bg-black/55">
                <button
                  type="button"
                  onClick={() => setShowConnections(true)}
                  className={`rounded-lg px-3 py-1.5 text-[11px] font-semibold tracking-wide transition ${
                    showConnections
                      ? "bg-[var(--accent)] text-white"
                      : "text-black/75 hover:bg-black/5 dark:text-white/80 dark:hover:bg-white/10"
                  }`}
                  title="Show your connections"
                >
                  Connections
                </button>
                <button
                  type="button"
                  onClick={() => setShowConnections(false)}
                  className={`rounded-lg px-3 py-1.5 text-[11px] font-semibold tracking-wide transition ${
                    !showConnections
                      ? "bg-[var(--accent)] text-white"
                      : "text-black/75 hover:bg-black/5 dark:text-white/80 dark:hover:bg-white/10"
                  }`}
                  title="Show people in your area"
                >
                  Area
                </button>
              </div>
            </div>
          ) : null}
          <ReactFlow
            nodes={nodes}
            edges={edges}
            fitView
            onNodeClick={(_, node) => setSelectedId(node.id)}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            minZoom={0.4}
            maxZoom={1.8}
            connectOnClick={false}
          >
            <Controls showInteractive={false} />
            <Background gap={16} size={1} />
          </ReactFlow>
        </div>
      </section>

      <aside className="paper-card rounded-2xl p-5">
        <div className="rounded-xl border border-[var(--border-soft)] p-3">
          <h4 className="text-sm font-semibold uppercase tracking-wide">Add connection</h4>
          {currentUserId ? (
            <form
              className="mt-3 space-y-2"
              onSubmit={(event) => {
                event.preventDefault();
                const targetId = selectedConnectionTarget?.id ?? filteredConnectableUsers[0]?.id ?? "";
                void createConnection(targetId);
              }}
            >
              <input
                type="search"
                value={connectionQuery}
                onChange={(event) => setConnectionQuery(event.target.value)}
                placeholder="Search by name, @handle, or location"
                className="w-full rounded-lg border border-[var(--border-soft)] bg-transparent px-3 py-2 text-sm outline-none"
                disabled={connectableUsers.length === 0 || isConnecting}
              />
              {connectableUsers.length === 0 ? (
                <p className="text-xs text-black/60 dark:text-white/70">No available members to connect with.</p>
              ) : (
                <div className="max-h-32 overflow-y-auto rounded-lg border border-[var(--border-soft)] p-1">
                  {filteredConnectableUsers.slice(0, 8).map((user) => {
                    const isSelected = user.id === connectionTargetId;
                    return (
                      <button
                        type="button"
                        key={user.id}
                        onClick={() => setConnectionTargetId(user.id)}
                        className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm transition ${
                          isSelected
                            ? "bg-[var(--accent)]/15 text-[var(--accent)]"
                            : "hover:bg-black/5 dark:hover:bg-white/10"
                        }`}
                      >
                        <span>{user.name}</span>
                        <span className="text-xs text-black/60 dark:text-white/70">@{user.handle}</span>
                      </button>
                    );
                  })}
                  {filteredConnectableUsers.length === 0 ? (
                    <p className="px-2 py-1 text-xs text-black/60 dark:text-white/70">No matches found.</p>
                  ) : null}
                </div>
              )}
              <p className="text-xs text-black/65 dark:text-white/70">
                {selectedConnectionTarget
                  ? `Selected: ${selectedConnectionTarget.name} (@${selectedConnectionTarget.handle})`
                  : "Choose a member from the results above."}
              </p>
              <select
                value={connectionType}
                onChange={(event) => setConnectionType(event.target.value as RelationshipType)}
                className="w-full rounded-lg border border-[var(--border-soft)] bg-transparent px-2 py-2 text-sm outline-none"
                disabled={isConnecting}
              >
                {(Object.keys(relationColors) as RelationshipType[]).map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                disabled={
                  (!selectedConnectionTarget && filteredConnectableUsers.length === 0) ||
                  isConnecting ||
                  connectableUsers.length === 0
                }
                className="w-full rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {isConnecting ? "Creating..." : "Create connection"}
              </button>
            </form>
          ) : (
            <p className="mt-2 text-xs text-black/65 dark:text-white/70">
              Sign in to create and manage your connections.
            </p>
          )}
        </div>

        {currentUserId ? (
          <div className="mt-4 rounded-xl border border-[var(--border-soft)] p-3">
            <h4 className="text-sm font-semibold uppercase tracking-wide">Pending requests</h4>
            {pendingRequests.length === 0 ? (
              <p className="mt-2 text-xs text-black/65 dark:text-white/70">No pending approvals.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {pendingRequests.map((item) => {
                  const parsed = parseRelationshipNote(item.note);
                  const otherUserId = item.source === currentUserId ? item.target : item.source;
                  const otherUser = users.find((user) => user.id === otherUserId);
                  const needsApproval = parsed.responderId === currentUserId;

                  return (
                    <div key={item.id} className="rounded-lg border border-[var(--border-soft)] p-2.5">
                      <p className="text-sm font-semibold">{otherUser?.name ?? "Member"}</p>
                      <p className="text-xs uppercase tracking-wide text-[var(--accent)]">{item.type}</p>
                      <p className="mt-1 text-[11px] text-black/65 dark:text-white/70">
                        {needsApproval ? "Waiting for your approval" : "Waiting for their approval"}
                      </p>
                      <div className="mt-2 flex gap-2">
                        {needsApproval ? (
                          <button
                            type="button"
                            onClick={() => respondToConnection(item.id, "approve")}
                            disabled={isRespondingId === item.id}
                            className="rounded-full bg-[var(--accent)] px-3 py-1 text-xs font-semibold text-white disabled:opacity-70"
                          >
                            Approve
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => respondToConnection(item.id, "reject")}
                          disabled={isRespondingId === item.id}
                          className="rounded-full border border-[var(--border-soft)] px-3 py-1 text-xs font-semibold disabled:opacity-70"
                        >
                          {needsApproval ? "Decline" : "Cancel"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : null}

        <div className="mt-4">
        {selectedUser ? (
          <>
            <div className="flex items-center gap-3">
              <Avatar name={selectedUser.name} className="h-14 w-14" />
              <div>
                <h3 className="text-xl font-semibold">{selectedUser.name}</h3>
                <p className="text-sm text-black/65 dark:text-white/75">@{selectedUser.handle}</p>
              </div>
            </div>
            <p className="mt-3 text-sm text-black/80 dark:text-white/85">{selectedUser.bio}</p>
            <p className="mt-2 text-xs text-black/65 dark:text-white/70">
              Status: {selectedUser.relationshipStatus}
            </p>

            <div className="mt-5 space-y-2">
              <h4 className="text-sm font-semibold uppercase tracking-wide">Active connections</h4>
              {isConnecting ? (
                <p className="text-xs text-black/65 dark:text-white/70">Saving new connection...</p>
              ) : null}
              {selectedConnections.map((item) => {
                const targetId = item.source === selectedUser.id ? item.target : item.source;
                const target = users.find((user) => user.id === targetId);
                const parsed = parseRelationshipNote(item.note);
                const canEdit = Boolean(
                  currentUserId &&
                    selectedUser.id === currentUserId &&
                    parsed.status === "approved" &&
                    (item.source === currentUserId || item.target === currentUserId)
                );
                const isEditing = editingRelationshipId === item.id;

                return (
                  <div key={item.id} className="rounded-xl border border-[var(--border-soft)] p-3">
                    <p className="font-semibold">{target?.name}</p>
                    {isEditing ? (
                      <>
                        <select
                          value={editingType}
                          onChange={(event) => setEditingType(event.target.value as RelationshipType)}
                          className="mt-1 w-full rounded-lg border border-[var(--border-soft)] bg-transparent px-2 py-1 text-xs uppercase tracking-wide outline-none"
                        >
                          {(Object.keys(relationColors) as RelationshipType[]).map((type) => (
                            <option key={type} value={type}>
                              {type}
                            </option>
                          ))}
                        </select>
                        <textarea
                          value={editingNote}
                          onChange={(event) => setEditingNote(event.target.value)}
                          rows={2}
                          className="mt-2 w-full rounded-lg border border-[var(--border-soft)] bg-transparent px-2 py-1 text-xs outline-none"
                          placeholder="Add a note"
                        />
                        <div className="mt-2 flex gap-2">
                          <button
                            type="button"
                            onClick={() => saveRelationshipEdit(item.id)}
                            disabled={isSavingEdit}
                            className="rounded-full bg-[var(--accent)] px-3 py-1 text-xs font-semibold text-white disabled:opacity-70"
                          >
                            {isSavingEdit ? "Saving..." : "Save"}
                          </button>
                          <button
                            type="button"
                            onClick={cancelEditing}
                            disabled={isSavingEdit}
                            className="rounded-full border border-[var(--border-soft)] px-3 py-1 text-xs font-semibold"
                          >
                            Cancel
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <p className="text-xs uppercase tracking-wide text-[var(--accent)]">{item.type}</p>
                        <p className="mt-1 text-xs text-black/65 dark:text-white/75">{parsed.note}</p>
                        {parsed.status === "pending" ? (
                          <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                            Pending approval
                          </p>
                        ) : null}
                        {canEdit ? (
                          <button
                            type="button"
                            onClick={() => startEditing(item)}
                            className="mt-2 rounded-full border border-[var(--border-soft)] px-3 py-1 text-xs font-semibold"
                          >
                            Edit connection
                          </button>
                        ) : null}
                        {currentUserId && parsed.status === "pending" ? (
                          <div className="mt-2 flex gap-2">
                            {selectedUser.id === currentUserId && parsed.responderId === currentUserId ? (
                              <button
                                type="button"
                                onClick={() => respondToConnection(item.id, "approve")}
                                disabled={isRespondingId === item.id}
                                className="rounded-full bg-[var(--accent)] px-3 py-1 text-xs font-semibold text-white disabled:opacity-70"
                              >
                                Approve
                              </button>
                            ) : null}
                            {selectedUser.id === currentUserId && (parsed.responderId === currentUserId || parsed.requesterId === currentUserId) ? (
                              <button
                                type="button"
                                onClick={() => respondToConnection(item.id, "reject")}
                                disabled={isRespondingId === item.id}
                                className="rounded-full border border-[var(--border-soft)] px-3 py-1 text-xs font-semibold disabled:opacity-70"
                              >
                                {parsed.responderId === currentUserId ? "Decline" : "Cancel"}
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <p className="text-sm">Select a node to preview member details.</p>
        )}
        </div>
      </aside>
    </div>
  );
}
