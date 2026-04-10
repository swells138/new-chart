"use client";

import {
  addEdge,
  Background,
  type Connection,
  Controls,
  MiniMap,
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
  friends: "#66b6a7",
  married: "#e85d8d",
  exes: "#ff8f84",
  collaborators: "#7aa2ff",
  roommates: "#ffbb6f",
  crushes: "#ee82d8",
  mentors: "#9b8cff",
};

interface Props {
  users: User[];
  relationships: Relationship[];
  currentUserId: string | null;
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

export function RelationshipMap({ users, relationships, currentUserId }: Props) {
  const [activeTypes, setActiveTypes] = useState<RelationshipType[]>([
    "friends",
    "married",
    "exes",
    "collaborators",
    "roommates",
    "crushes",
    "mentors",
  ]);
  const [selectedId, setSelectedId] = useState<string | null>(users[0]?.id ?? null);
  const [connectionType, setConnectionType] = useState<RelationshipType>("friends");
  const [allRelationships, setAllRelationships] = useState<Relationship[]>(relationships);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [editingRelationshipId, setEditingRelationshipId] = useState<string | null>(null);
  const [editingType, setEditingType] = useState<RelationshipType>("friends");
  const [editingNote, setEditingNote] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isRespondingId, setIsRespondingId] = useState<string | null>(null);

  useEffect(() => {
    setAllRelationships(relationships);
  }, [relationships]);

  const mappedNodes: Node[] = useMemo(
    () =>
      users.map((user, index) => ({
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
      })),
    [users]
  );

  const filteredRelationships = useMemo(
    () => allRelationships.filter((item) => activeTypes.includes(item.type)),
    [activeTypes, allRelationships]
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

  async function onConnect(connection: Connection) {
    if (!connection.source || !connection.target) {
      return;
    }

    if (connection.source === connection.target) {
      setConnectionError("A user cannot connect to themselves.");
      return;
    }

    const duplicate = allRelationships.some(
      (item) =>
        (item.source === connection.source && item.target === connection.target) ||
        (item.source === connection.target && item.target === connection.source)
    );

    if (duplicate) {
      setConnectionError("These users are already connected.");
      return;
    }

    if (!currentUserId || (connection.source !== currentUserId && connection.target !== currentUserId)) {
      setConnectionError("You can only create connections that include your own profile.");
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
          source: connection.source,
          target: connection.target,
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
      setSelectedId(connection.source);

      if (parseRelationshipNote(relationship.note).status === "approved") {
        setEdges((prev) =>
          addEdge(
            {
              id: relationship.id,
              source: relationship.source,
              target: relationship.target,
              label: relationship.type,
              style: {
                stroke: relationColors[relationship.type],
                strokeWidth: 2,
              },
              labelStyle: {
                fontSize: 10,
                fill: relationColors[relationship.type],
                textTransform: "uppercase",
              },
            },
            prev
          )
        );
      }
    } catch (error) {
      console.error(error);
      setConnectionError("Could not create that connection.");
    } finally {
      setIsConnecting(false);
    }
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
        body: JSON.stringify({ id, action }),
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

  const selectedUser = users.find((user) => user.id === selectedId);
  const selectedConnections = filteredRelationships.filter(
    (item) => item.source === selectedId || item.target === selectedId
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[1.5fr_0.9fr]">
      <section className="paper-card rounded-2xl p-4">
        <div className="mb-3 flex flex-wrap gap-2">
          <label className="mr-2 flex items-center gap-2 rounded-full border border-[var(--border-soft)] px-3 py-1 text-xs font-semibold uppercase tracking-wide">
            <span>New link</span>
            <select
              value={connectionType}
              onChange={(event) => setConnectionType(event.target.value as RelationshipType)}
              className="bg-transparent text-[11px] outline-none"
            >
              {(Object.keys(relationColors) as RelationshipType[]).map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>
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
          Drag from one node handle to another to create a new connection.
        </p>
        {currentUserId ? null : (
          <p className="mb-3 text-xs text-black/65 dark:text-white/70">
            Sign in to create and edit your own connections.
          </p>
        )}
        {connectionError ? (
          <p className="mb-3 text-sm text-red-700 dark:text-red-400">{connectionError}</p>
        ) : null}
        <div className="h-[520px] overflow-hidden rounded-2xl border border-[var(--border-soft)] bg-white/40 dark:bg-black/20">
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
            <MiniMap pannable zoomable />
            <Controls showInteractive={false} />
            <Background gap={16} size={1} />
          </ReactFlow>
        </div>
      </section>

      <aside className="paper-card rounded-2xl p-5">
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
                            {parsed.responderId === currentUserId ? (
                              <button
                                type="button"
                                onClick={() => respondToConnection(item.id, "approve")}
                                disabled={isRespondingId === item.id}
                                className="rounded-full bg-[var(--accent)] px-3 py-1 text-xs font-semibold text-white disabled:opacity-70"
                              >
                                Approve
                              </button>
                            ) : null}
                            {(parsed.responderId === currentUserId || parsed.requesterId === currentUserId) ? (
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
      </aside>
    </div>
  );
}
