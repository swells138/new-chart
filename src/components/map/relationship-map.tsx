"use client";

import {
  Background,
  type Connection,
  Controls,
  Handle,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { PlaceholderPerson, Relationship, RelationshipType, User } from "@/types/models";
import { Avatar } from "@/components/ui/avatar";
import { PrivateChart } from "@/components/map/private-chart";

// ─── Demo-style node colours ───────────────────────────────
const NODE_PALETTE = [
  "#ff8f84", "#a78bfa", "#66b6a7", "#ffd08d", "#fb923c",
  "#f472b6", "#63b1ff", "#7aa2ff", "#ee82d8", "#9b8cff",
];

function hashColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffffffff;
  return NODE_PALETTE[Math.abs(h) % NODE_PALETTE.length];
}

function hashNumber(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 33 + id.charCodeAt(i)) & 0xffffffff;
  return Math.abs(h);
}

function getOrganicPosition(index: number, total: number, id: string, isCurrentUser: boolean) {
  if (isCurrentUser) {
    return { x: 430, y: 250 };
  }

  const seed = hashNumber(id);
  const safeTotal = Math.max(total, 1);
  const ring = 1 + (index % 3);
  const baseRadius = 120 + ring * 70;
  const jitterRadius = (seed % 35) - 17;
  const jitterY = (seed % 30) - 15;
  const baseAngle = (index / safeTotal) * Math.PI * 2;
  const seededAngle = ((seed % 360) * Math.PI) / 180;
  const angle = baseAngle + seededAngle * 0.2;

  return {
    x: 430 + Math.cos(angle) * (baseRadius + jitterRadius),
    y: 250 + Math.sin(angle) * (baseRadius * 0.62 + jitterY),
  };
}

type PersonNodeData = { label: string; handle: string; color: string };

function PersonNode({ data, selected }: { data: PersonNodeData; selected?: boolean }) {
  const initial = (data.label?.[0] ?? "?").toUpperCase();
  // Show first name only so the pill stays compact below the circle
  const displayName = data.label.split(" ")[0] ?? data.label;
  return (
    <>
      <Handle
        type="target"
        id="target-left"
        position={Position.Left}
        style={{ opacity: 0, top: 23, transform: "translateY(-50%)" }}
      />
      <Handle
        type="target"
        id="target-right"
        position={Position.Right}
        style={{ opacity: 0, top: 23, transform: "translateY(-50%)" }}
      />
      <div style={{ textAlign: "center", width: 86 }}>
        <div
          style={{
            width: 50,
            height: 50,
            borderRadius: "50%",
            background: `radial-gradient(circle at 38% 32%, ${data.color} 0%, color-mix(in srgb, ${data.color}, #000 28%) 100%)`,
            boxShadow: `0 0 22px ${data.color}44, 0 8px 24px rgba(0,0,0,0.42)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto",
            border: selected ? `2.5px solid ${data.color}` : "2px solid rgba(255,255,255,0.14)",
            transition: "transform 0.22s ease, box-shadow 0.22s ease",
            transform: selected ? "translateY(-1px) scale(1.03)" : "translateY(0) scale(1)",
          }}
        >
          <span style={{ color: "white", fontWeight: 700, fontSize: 15, fontFamily: "system-ui", userSelect: "none" }}>
            {initial}
          </span>
        </div>
        <div
          style={{
            marginTop: 6,
            background: "linear-gradient(180deg, rgba(11,9,27,0.8), rgba(4,3,16,0.72))",
            border: "1px solid rgba(255,255,255,0.16)",
            borderRadius: 999,
            padding: "3px 10px",
            maxWidth: 86,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            margin: "6px auto 0",
            backdropFilter: "blur(6px)",
          }}
        >
          <span style={{ color: "rgba(255,255,255,0.88)", fontSize: 10, fontWeight: 600, fontFamily: "system-ui", userSelect: "none" }}>
            {displayName}
          </span>
        </div>
      </div>
      <Handle
        type="source"
        id="source-left"
        position={Position.Left}
        style={{ opacity: 0, top: 23, transform: "translateY(-50%)" }}
      />
      <Handle
        type="source"
        id="source-right"
        position={Position.Right}
        style={{ opacity: 0, top: 23, transform: "translateY(-50%)" }}
      />
    </>
  );
}

const nodeTypes = { person: PersonNode } as const;

const relationColors: Record<RelationshipType, string> = {
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

interface Props {
  users: User[];
  relationships: Relationship[];
  currentUserId: string | null;
  isSignedIn?: boolean;
  userConnections?: Relationship[];
  areaUsers?: User[];
  privatePlaceholders?: PlaceholderPerson[];
  baseUrl?: string;
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

export function RelationshipMap({
  users,
  relationships,
  currentUserId,
  isSignedIn = false,
  userConnections,
  areaUsers,
  privatePlaceholders = [],
  baseUrl = "",
}: Props) {
    const hasDbUser = Boolean(currentUserId);
    const needsAccountSync = isSignedIn && !hasDbUser;

  const searchParams = useSearchParams();
  const [chartLayer, setChartLayer] = useState<"private" | "public">("public");
  const [activeTypes, setActiveTypes] = useState<RelationshipType[]>([
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
  ]);
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

  useEffect(() => {
    const chart = searchParams.get("chart");
    if (chart === "private" || chart === "public") {
      setChartLayer(chart);
    } else if (chart === "direct") {
      setChartLayer("private");
    } else if (chart === "extended") {
      setChartLayer("public");
    }

    const focus = searchParams.get("focus");
    if (focus === "approvals") {
      if (currentUserId) {
        setSelectedId(currentUserId);
      }
    }
  }, [searchParams, currentUserId]);

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

  const approvedRelationships = useMemo(
    () => allRelationships.filter((item) => parseRelationshipNote(item.note).status === "approved"),
    [allRelationships]
  );

  const limitedExtendedNodeIds = useMemo(() => {
    if (!currentUserId) {
      return {
        nodeIds: new Set<string>(),
        hiddenCount: 0,
        totalExtendedCount: 0,
      };
    }

    const directIds = new Set<string>();
    approvedUserConnections.forEach((item) => {
      if (item.source === currentUserId) {
        directIds.add(item.target);
      }
      if (item.target === currentUserId) {
        directIds.add(item.source);
      }
    });

    const extendedScores = new Map<string, number>();

    approvedRelationships.forEach((item) => {
      if (directIds.has(item.source) && item.target !== currentUserId && !directIds.has(item.target)) {
        extendedScores.set(item.target, (extendedScores.get(item.target) ?? 0) + 1);
      }
      if (directIds.has(item.target) && item.source !== currentUserId && !directIds.has(item.source)) {
        extendedScores.set(item.source, (extendedScores.get(item.source) ?? 0) + 1);
      }
    });

    const orderedExtendedIds = users
      .filter((user) => extendedScores.has(user.id))
      .sort((left, right) => {
        const scoreDifference = (extendedScores.get(right.id) ?? 0) - (extendedScores.get(left.id) ?? 0);
        if (scoreDifference !== 0) {
          return scoreDifference;
        }
        return left.name.localeCompare(right.name);
      })
      .map((user) => user.id);

    const visibleExtendedIds = orderedExtendedIds.slice(0, 25);
    return {
      nodeIds: new Set<string>([currentUserId, ...Array.from(directIds), ...visibleExtendedIds]),
      hiddenCount: Math.max(0, orderedExtendedIds.length - visibleExtendedIds.length),
      totalExtendedCount: orderedExtendedIds.length,
    };
  }, [approvedRelationships, approvedUserConnections, currentUserId, users]);

  // Determine which users to display based on view mode
  const displayedUsers = useMemo(() => {
    if (currentUserId) {
      return users.filter((user) => limitedExtendedNodeIds.nodeIds.has(user.id));
    }

    const baseUsers = areaUsers && areaUsers.length > 0 ? areaUsers : users;
    const connectedInGraph = new Set<string>();
    approvedRelationships.forEach((item) => {
      connectedInGraph.add(item.source);
      connectedInGraph.add(item.target);
    });

    return baseUsers.filter((user) => connectedInGraph.has(user.id));
  }, [users, areaUsers, currentUserId, limitedExtendedNodeIds, approvedRelationships]);

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
  const displayedRelationships = useMemo(() => approvedRelationships, [approvedRelationships]);

  const mappedNodes: Node[] = useMemo(() => {
    const orderedUsers = [...displayedUsers].sort((left, right) => {
      if (currentUserId && left.id === currentUserId) return -1;
      if (currentUserId && right.id === currentUserId) return 1;
      return left.name.localeCompare(right.name);
    });

    return orderedUsers.map((user, index) => ({
      id: user.id,
      type: "person",
      data: { label: user.name, handle: user.handle, color: hashColor(user.id) },
      position: getOrganicPosition(index, orderedUsers.length, user.id, user.id === currentUserId),
      style: { background: "transparent", border: "none", padding: 0 },
      draggable: currentUserId ? user.id === currentUserId : true,
    }));
  }, [displayedUsers, currentUserId]);

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
    () => {
      const nodeById = new Map(mappedNodes.map((node) => [node.id, node]));

      return graphRelationships.map((item) => {
        const sourceNode = nodeById.get(item.source);
        const targetNode = nodeById.get(item.target);
        const sourceX = sourceNode?.position.x ?? 0;
        const targetX = targetNode?.position.x ?? 0;
        const sourceIsLeft = sourceX <= targetX;

        return {
          id: item.id,
          source: item.source,
          target: item.target,
          sourceHandle: sourceIsLeft ? "source-right" : "source-left",
          targetHandle: sourceIsLeft ? "target-left" : "target-right",
          type: "bezier",
          label: item.type,
          animated: true,
          style: {
            stroke: relationColors[item.type],
            strokeWidth: 2.4,
            strokeOpacity: 0.8,
          },
          labelStyle: {
            fontSize: 10,
            fill: relationColors[item.type],
            fontWeight: 600,
            fontFamily: "system-ui",
          },
          labelBgStyle: {
            fill: "rgba(8,6,22,0.8)",
            stroke: relationColors[item.type],
            strokeWidth: 0.75,
            strokeOpacity: 0.55,
          },
          labelBgPadding: [6, 8] as [number, number],
          labelBgBorderRadius: 999,
        };
      });
    },
    [graphRelationships, mappedNodes]
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
      setConnectionError(needsAccountSync ? "Finishing your account setup. Please reload in a moment." : "Sign in to create connections.");
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
      setConnectionError(needsAccountSync ? "Finishing your account setup. Please reload in a moment." : "Sign in to create connections.");
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
    <div className="space-y-4">
      <div className="rounded-2xl border border-[var(--border-soft)] bg-white/70 p-2 dark:bg-black/30">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setChartLayer("private")}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
              chartLayer === "private"
                ? "bg-[var(--accent)] text-white"
                : "text-black/70 hover:bg-black/5 dark:text-white/70 dark:hover:bg-white/10"
            }`}
          >
            Direct Connections
          </button>
          <button
            type="button"
            onClick={() => setChartLayer("public")}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
              chartLayer === "public"
                ? "bg-[var(--accent)] text-white"
                : "text-black/70 hover:bg-black/5 dark:text-white/70 dark:hover:bg-white/10"
            }`}
          >
            Extended Network
          </button>
        </div>
        <p className="mt-2 text-xs text-black/60 dark:text-white/60">
          Direct connections are always visible to you. Extended exploration shows up to 25 confirmed connections for free.
        </p>
      </div>

      {chartLayer === "private" && currentUserId ? (
        <PrivateChart
          initialPlaceholders={privatePlaceholders}
          baseUrl={baseUrl}
          currentUserId={currentUserId}
          approvedConnections={approvedUserConnections}
          users={users}
        />
      ) : null}

      {chartLayer === "private" && !currentUserId ? (
        <section
          className="rounded-2xl border border-white/10 p-6 text-center"
          style={{ background: "linear-gradient(145deg, #0f0819 0%, #160d28 100%)" }}
        >
          <p className="text-sm font-semibold text-white">
            {needsAccountSync ? "Setting up your network" : "Sign in to save your direct connections"}
          </p>
          <p className="mt-1 text-xs text-white/60">
            {needsAccountSync
              ? "Your account is authenticated. We are syncing your profile data now."
              : "You can add people, manage placeholders, and verify connections once you have an account."}
          </p>
          {needsAccountSync ? (
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold text-white/85 transition hover:bg-white/10"
              >
                Reload
              </button>
            </div>
          ) : (
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Link
                href="/signup"
                className="rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white transition hover:brightness-95"
              >
                Create account
              </Link>
              <Link
                href="/login"
                className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold text-white/85 transition hover:bg-white/10"
              >
                Sign in
              </Link>
              <button
                type="button"
                onClick={() => setChartLayer("public")}
                className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold text-white/85 transition hover:bg-white/10"
              >
                View extended network
              </button>
            </div>
          )}
        </section>
      ) : null}

      {chartLayer === "public" ? (
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
          Use the side form to connect with an existing member, or drag from your node to another member.
        </p>
        {hasDbUser ? null : (
          <p className="mb-3 text-xs text-black/65 dark:text-white/70">
            {needsAccountSync
              ? "Your account is signed in and syncing. Reload shortly to manage connections."
              : "Sign in to create and edit your own connections."}
          </p>
        )}
        {currentUserId && limitedExtendedNodeIds.hiddenCount > 0 ? (
          <div className="mb-3 rounded-xl border border-[var(--border-soft)] bg-black/[0.03] p-3 text-sm dark:bg-white/5">
            <p className="font-semibold">You&apos;ve explored your first 25 connections</p>
            <p className="mt-1 text-xs text-black/65 dark:text-white/70">
              +{limitedExtendedNodeIds.hiddenCount} more hidden
            </p>
            <Link
              href="/profile"
              className="mt-3 inline-flex rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white"
            >
              Unlock full network
            </Link>
          </div>
        ) : null}
        {connectionError ? (
          <p className="mb-3 text-sm text-red-700 dark:text-red-400">{connectionError}</p>
        ) : null}
        <div className="relative h-[520px] overflow-hidden rounded-2xl border border-[var(--border-soft)]" style={{ background: "#0f0819" }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
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
            <Background gap={24} size={1} color="rgba(255,255,255,0.07)" />
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
              {needsAccountSync
                ? "Signed in. Finalizing account sync..."
                : "Sign in to create and manage your connections."}
            </p>
          )}
        </div>

        {currentUserId ? (
          <div id="pending-verification" className="mt-4 rounded-xl border border-[var(--border-soft)] p-3">
            <h4 className="text-sm font-semibold uppercase tracking-wide">Pending Verification</h4>
            {pendingRequests.length === 0 ? (
              <p className="mt-2 text-xs text-black/65 dark:text-white/70">No pending verifications.</p>
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
                        {needsApproval ? "Waiting for your verification" : "Waiting for their verification"}
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
              <h4 className="text-sm font-semibold uppercase tracking-wide">Direct Connections</h4>
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
                            Pending verification
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
                        {parsed.status === "approved" && currentUserId ? (
                          <div className="mt-2 flex flex-wrap gap-2">
                            <span className="rounded-full bg-green-100 px-3 py-1 text-[11px] font-semibold text-green-700 dark:bg-green-900/30 dark:text-green-300">
                              Confirmed in network
                            </span>
                          </div>
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
      ) : null}
    </div>
  );
}
