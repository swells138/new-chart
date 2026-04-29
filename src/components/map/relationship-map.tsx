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
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  PlaceholderPerson,
  Relationship,
  RelationshipType,
  User,
} from "@/types/models";
import { Avatar } from "@/components/ui/avatar";
import { PrivateChart } from "@/components/map/private-chart";

// ─── Demo-style node colours ───────────────────────────────
const NODE_PALETTE = [
  "#ff8f84",
  "#a78bfa",
  "#66b6a7",
  "#ffd08d",
  "#fb923c",
  "#f472b6",
  "#63b1ff",
  "#7aa2ff",
  "#ee82d8",
  "#9b8cff",
];

function hashColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++)
    h = (h * 31 + id.charCodeAt(i)) & 0xffffffff;
  return NODE_PALETTE[Math.abs(h) % NODE_PALETTE.length];
}

function hashNumber(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++)
    h = (h * 33 + id.charCodeAt(i)) & 0xffffffff;
  return Math.abs(h);
}

function getOrganicPosition(
  index: number,
  total: number,
  id: string,
  isCurrentUser: boolean,
  degree = 1,
) {
  if (isCurrentUser) {
    return { x: 430, y: 250 };
  }

  const seed = hashNumber(id);
  const safeTotal = Math.max(total, 1);
  // nodes with no connections are intentionally pushed further out for visibility
  const isIsolated = degree === 0;
  const ring = isIsolated ? 4 + (index % 2) : 1 + (index % 3);
  const baseRadius = 130 + ring * 80 + (isIsolated ? 180 : 0);
  const jitterRadius = (seed % 40) - 20;
  const jitterY = (seed % 35) - 17;
  const baseAngle = (index / safeTotal) * Math.PI * 2;
  const seededAngle = ((seed % 360) * Math.PI) / 180;
  const angle = baseAngle + seededAngle * 0.18;

  return {
    x: 430 + Math.cos(angle) * (baseRadius + jitterRadius),
    y: 250 + Math.sin(angle) * (baseRadius * 0.62 + jitterY),
  };
}

type PersonNodeData = {
  label: string;
  handle: string;
  color: string;
  isPulsing?: boolean;
  isBouncing?: boolean;
  isConnected?: boolean;
  degree?: number;
};

function PersonNode({
  data,
  selected,
}: {
  data: PersonNodeData;
  selected?: boolean;
}) {
  const initial = (data.label?.[0] ?? "?").toUpperCase();
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
        <div style={{ display: "flex", justifyContent: "center" }}>
          <div
            className={data.isBouncing ? "map-node-bounce" : undefined}
            style={{
              width: 40,
              height: 40,
              borderRadius: "50%",
              background: data.color,
              boxShadow: data.isPulsing
                ? `0 6px 18px ${data.color}22`
                : `0 2px 6px rgba(2,6,23,0.18)`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto",
              border: selected
                ? `2px solid ${data.color}`
                : "1px solid rgba(255,255,255,0.06)",
              transition: "transform 0.18s ease, box-shadow 0.18s ease",
              transform: selected
                ? "translateY(-1px) scale(1.04)"
                : "translateY(0) scale(1)",
            }}
          >
            <span
              style={{
                color: "white",
                fontWeight: 700,
                fontSize: 13,
                fontFamily: "system-ui",
                userSelect: "none",
              }}
            >
              {initial}
            </span>
          </div>
        </div>

        <div
          style={{
            marginTop: 6,
            borderRadius: 999,
            padding: "2px 8px",
            maxWidth: 86,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            margin: "6px auto 0",
          }}
        >
          <span
            style={{
              color: "rgba(255,255,255,0.9)",
              fontSize: 11,
              fontWeight: 600,
              fontFamily: "system-ui",
              userSelect: "none",
            }}
          >
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

function isVisibleByType(type: string, active: RelationshipType[]) {
  const isKnownType = Object.prototype.hasOwnProperty.call(
    relationColors,
    type,
  );
  if (!isKnownType) {
    // Keep legacy/custom test relationship types visible by default.
    return true;
  }
  return active.includes(type as RelationshipType);
}

interface Props {
  users: User[];
  relationships: Relationship[];
  currentUserId: string | null;
  isSignedIn?: boolean;
  userConnections?: Relationship[];
  privatePlaceholders?: PlaceholderPerson[];
  baseUrl?: string;
}

type ApprovalStatus =
  | "active"
  | "pending_claim"
  | "pending_creator_confirmation"
  | "rejected"
  | "expired"
  | "disputed";

const metaPrefix = "[[meta:";
const metaSuffix = "]]";

function parseRelationshipNote(input: string): {
  status: ApprovalStatus;
  creatorId: string | null;
  claimedByUserId: string | null;
  claimConfirmedAt: string | null;
  expiresAt: string | null;
  disputeReason: string | null;
  note: string;
} {
  const raw = input ?? "";

  if (!raw.startsWith(metaPrefix)) {
    return {
      status: "active",
      creatorId: null,
      claimedByUserId: null,
      claimConfirmedAt: null,
      expiresAt: null,
      disputeReason: null,
      note: raw,
    };
  }

  const endIndex = raw.indexOf(metaSuffix);
  if (endIndex === -1) {
    return {
      status: "active",
      creatorId: null,
      claimedByUserId: null,
      claimConfirmedAt: null,
      expiresAt: null,
      disputeReason: null,
      note: raw,
    };
  }

  try {
    const meta = JSON.parse(raw.slice(metaPrefix.length, endIndex)) as {
      status?: string;
      creatorId?: string;
      claimedByUserId?: string;
      requesterId?: string;
      responderId?: string;
      claimConfirmedAt?: string;
      expiresAt?: string;
      disputeReason?: string;
    };

    const status: ApprovalStatus =
      meta.status === "pending" || meta.status === "pending_claim"
        ? "pending_claim"
        : meta.status === "pending_creator_confirmation"
          ? "pending_creator_confirmation"
          : meta.status === "rejected"
            ? "rejected"
            : meta.status === "expired"
              ? "expired"
              : meta.status === "disputed"
                ? "disputed"
                : "active";

    return {
      status,
      creatorId:
        typeof meta.creatorId === "string"
          ? meta.creatorId
          : typeof meta.requesterId === "string"
            ? meta.requesterId
            : null,
      claimedByUserId:
        typeof meta.claimedByUserId === "string"
          ? meta.claimedByUserId
          : typeof meta.responderId === "string"
            ? meta.responderId
            : null,
      claimConfirmedAt:
        typeof meta.claimConfirmedAt === "string"
          ? meta.claimConfirmedAt
          : null,
      expiresAt: typeof meta.expiresAt === "string" ? meta.expiresAt : null,
      disputeReason:
        typeof meta.disputeReason === "string" ? meta.disputeReason : null,
      note: raw.slice(endIndex + metaSuffix.length).trim(),
    };
  } catch {
    return {
      status: "active",
      creatorId: null,
      claimedByUserId: null,
      claimConfirmedAt: null,
      expiresAt: null,
      disputeReason: null,
      note: raw,
    };
  }
}

function formatUtcDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

export function RelationshipMap({
  users,
  relationships,
  currentUserId,
  isSignedIn = false,
  userConnections,
  privatePlaceholders = [],
  baseUrl = "",
}: Props) {
  const router = useRouter();
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
  const [selectedId, setSelectedId] = useState<string | null>(
    users[0]?.id ?? null,
  );
  const [connectionTargetId, setConnectionTargetId] = useState<string>("");
  const [connectionQuery, setConnectionQuery] = useState<string>("");
  const [connectionType, setConnectionType] =
    useState<RelationshipType>("Friends");
  const [allRelationships, setAllRelationships] =
    useState<Relationship[]>(relationships);
  // Track IDs that have been mutated client-side so SSR rehydration doesn't overwrite them.
  const locallyMutatedIds = useRef(new Set<string>());
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [editingRelationshipId, setEditingRelationshipId] = useState<
    string | null
  >(null);
  const [editingType, setEditingType] = useState<RelationshipType>("Friends");
  const [editingNote, setEditingNote] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isDeletingEdit, setIsDeletingEdit] = useState(false);
  const [isRespondingId, setIsRespondingId] = useState<string | null>(null);
  const [reportingUserId, setReportingUserId] = useState<string | null>(null);
  const [resolvedCurrentUserId, setResolvedCurrentUserId] = useState<
    string | null
  >(currentUserId);
  const [isResolvingCurrentUserId, setIsResolvingCurrentUserId] =
    useState(false);
  const [hasAttemptedUserBootstrap, setHasAttemptedUserBootstrap] =
    useState(false);
  const [hasBrowserSession, setHasBrowserSession] = useState(false);
  const [recentEdgeId, setRecentEdgeId] = useState<string | null>(null);
  const [pulsingNodeIds, setPulsingNodeIds] = useState<string[]>([]);
  const [bouncingNodeId, setBouncingNodeId] = useState<string | null>(null);
  const feedbackTimeoutRef = useRef<number | null>(null);

  function triggerConnectionFeedback(
    edgeId: string,
    sourceId: string,
    targetId: string,
  ) {
    setRecentEdgeId(edgeId);
    setPulsingNodeIds([sourceId, targetId]);
    setBouncingNodeId(targetId);

    if (feedbackTimeoutRef.current !== null) {
      window.clearTimeout(feedbackTimeoutRef.current);
    }

    feedbackTimeoutRef.current = window.setTimeout(() => {
      setRecentEdgeId((current) => (current === edgeId ? null : current));
      setPulsingNodeIds([]);
      setBouncingNodeId((current) => (current === targetId ? null : current));
      feedbackTimeoutRef.current = null;
    }, 1300);
  }

  const getBrowserClerkToken = useCallback(async () => {
    if (typeof window === "undefined") {
      return null;
    }

    const maybeClerk = (
      window as Window & {
        Clerk?: {
          session?: {
            getToken?: () => Promise<string | null>;
          };
        };
      }
    ).Clerk;

    if (!maybeClerk?.session?.getToken) {
      return null;
    }

    try {
      return await maybeClerk.session.getToken();
    } catch {
      return null;
    }
  }, []);

  const activeCurrentUserId = resolvedCurrentUserId ?? currentUserId;
  const hasDbUser = Boolean(activeCurrentUserId);
  const isSignedInEffective = Boolean(isSignedIn || hasBrowserSession);
  const needsAccountSync = isSignedInEffective && !hasDbUser;

  const authFetch = useCallback(
    async (input: string, init?: RequestInit) => {
      const headers = new Headers(init?.headers);

      const token = await getBrowserClerkToken();
      if (token) {
        headers.set("Authorization", `Bearer ${token}`);
      }

      return fetch(input, {
        ...init,
        headers,
      });
    },
    [getBrowserClerkToken],
  );

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const token = await getBrowserClerkToken();
      if (!cancelled && token) {
        setHasBrowserSession(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [getBrowserClerkToken]);

  useEffect(() => {
    setResolvedCurrentUserId(currentUserId);
  }, [currentUserId]);

  useEffect(() => {
    return () => {
      if (feedbackTimeoutRef.current !== null) {
        window.clearTimeout(feedbackTimeoutRef.current);
      }
    };
  }, []);

  const ensureCurrentUserId = useCallback(
    async (options?: { silent?: boolean }) => {
      const silent = options?.silent ?? false;

      if (activeCurrentUserId) {
        return activeCurrentUserId;
      }

      if (isResolvingCurrentUserId) {
        return null;
      }

      setIsResolvingCurrentUserId(true);

      try {
        const response = await authFetch("/api/profile", { cache: "no-store" });
        const body = (await response.json()) as {
          profile?: { id?: string };
          error?: string;
        };

        if (!response.ok) {
          if (!silent && response.status !== 401) {
            setConnectionError(
              body.error ?? "Could not verify your account. Please try again.",
            );
          }
          return null;
        }

        const dbUserId = body.profile?.id;
        if (!dbUserId) {
          if (!silent) {
            setConnectionError(
              "Could not find your account record yet. Please reload shortly.",
            );
          }
          return null;
        }

        setResolvedCurrentUserId(dbUserId);
        return dbUserId;
      } catch (error) {
        console.error(error);
        if (!silent) {
          setConnectionError(
            "Could not verify your account. Please try again.",
          );
        }
        return null;
      } finally {
        setIsResolvingCurrentUserId(false);
      }
    },
    [activeCurrentUserId, authFetch, isResolvingCurrentUserId],
  );

  useEffect(() => {
    if (activeCurrentUserId || hasAttemptedUserBootstrap) {
      return;
    }

    setHasAttemptedUserBootstrap(true);
    void ensureCurrentUserId({ silent: true });
  }, [activeCurrentUserId, hasAttemptedUserBootstrap, ensureCurrentUserId]);

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
      if (activeCurrentUserId) {
        setSelectedId(activeCurrentUserId);
      }
    } else if (focus === "manage") {
      setChartLayer("private");
      if (typeof window !== "undefined") {
        window.setTimeout(() => {
          document
            .getElementById("manage-connections")
            ?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 0);
      }
    }
  }, [searchParams, activeCurrentUserId]);

  const scopedRelationships = useMemo(() => {
    const byId = new Map<string, Relationship>();

    relationships.forEach((item) => {
      byId.set(item.id, item);
    });

    if (activeCurrentUserId && userConnections) {
      userConnections.forEach((item) => {
        if (
          item.source === activeCurrentUserId ||
          item.target === activeCurrentUserId
        ) {
          byId.set(item.id, item);
        }
      });
    }

    return Array.from(byId.values());
  }, [relationships, userConnections, activeCurrentUserId]);

  useEffect(() => {
    setAllRelationships((prev) => {
      // Merge: keep locally-mutated relationships as-is; fill in new ones from SSR.
      const mutated = locallyMutatedIds.current;
      const prevById = new Map(prev.map((r) => [r.id, r]));
      const merged = scopedRelationships.map((r) =>
        mutated.has(r.id) ? (prevById.get(r.id) ?? r) : r,
      );
      // Keep locally-added (not yet in SSR) entries too.
      const ssrIds = new Set(scopedRelationships.map((r) => r.id));
      prev.forEach((r) => {
        if (!ssrIds.has(r.id)) {
          merged.push(r);
        }
      });
      return merged;
    });
  }, [scopedRelationships]);

  const approvedUserConnections = useMemo(
    () =>
      allRelationships.filter((item) => {
        const parsed = parseRelationshipNote(item.note);
        if (parsed.status !== "active") {
          return false;
        }
        if (!activeCurrentUserId) {
          return false;
        }
        return (
          item.source === activeCurrentUserId ||
          item.target === activeCurrentUserId
        );
      }),
    [allRelationships, activeCurrentUserId],
  );

  const approvedRelationships = useMemo(
    () =>
      allRelationships.filter(
        (item) => parseRelationshipNote(item.note).status === "active",
      ),
    [allRelationships],
  );

  const limitedExtendedNodeIds = useMemo(() => {
    if (!activeCurrentUserId) {
      return {
        nodeIds: new Set<string>(),
        hiddenCount: 0,
        totalExtendedCount: 0,
      };
    }

    const directIds = new Set<string>();
    approvedUserConnections.forEach((item) => {
      if (item.source === activeCurrentUserId) {
        directIds.add(item.target);
      }
      if (item.target === activeCurrentUserId) {
        directIds.add(item.source);
      }
    });

    const extendedScores = new Map<string, number>();

    approvedRelationships.forEach((item) => {
      if (
        directIds.has(item.source) &&
        item.target !== activeCurrentUserId &&
        !directIds.has(item.target)
      ) {
        extendedScores.set(
          item.target,
          (extendedScores.get(item.target) ?? 0) + 1,
        );
      }
      if (
        directIds.has(item.target) &&
        item.source !== activeCurrentUserId &&
        !directIds.has(item.source)
      ) {
        extendedScores.set(
          item.source,
          (extendedScores.get(item.source) ?? 0) + 1,
        );
      }
    });

    const orderedExtendedIds = users
      .filter((user) => extendedScores.has(user.id))
      .sort((left, right) => {
        const scoreDifference =
          (extendedScores.get(right.id) ?? 0) -
          (extendedScores.get(left.id) ?? 0);
        if (scoreDifference !== 0) {
          return scoreDifference;
        }
        return left.name.localeCompare(right.name);
      })
      .map((user) => user.id);

    const visibleExtendedIds = orderedExtendedIds.slice(0, 25);
    return {
      nodeIds: new Set<string>([
        activeCurrentUserId,
        ...Array.from(directIds),
        ...visibleExtendedIds,
      ]),
      hiddenCount: Math.max(
        0,
        orderedExtendedIds.length - visibleExtendedIds.length,
      ),
      totalExtendedCount: orderedExtendedIds.length,
    };
  }, [
    approvedRelationships,
    approvedUserConnections,
    activeCurrentUserId,
    users,
  ]);

  // Determine which users to display based on view mode
  const displayedUsers = useMemo(() => {
    if (chartLayer === "private" && activeCurrentUserId) {
      return users.filter((user) =>
        limitedExtendedNodeIds.nodeIds.has(user.id),
      );
    }

    // Public view: show users that currently have at least one visible connection.
    const visiblePublicRelationships = approvedRelationships.filter((item) =>
      isVisibleByType(item.type, activeTypes),
    );

    const baseUsers = users;
    const connectedInGraph = new Set<string>();
    visiblePublicRelationships.forEach((item) => {
      connectedInGraph.add(item.source);
      connectedInGraph.add(item.target);
    });

    return baseUsers.filter(
      (user) =>
        connectedInGraph.has(user.id) || user.id === activeCurrentUserId,
    );
  }, [
    users,
    chartLayer,
    activeCurrentUserId,
    limitedExtendedNodeIds,
    approvedRelationships,
    activeTypes,
  ]);

  useEffect(() => {
    if (displayedUsers.length === 0) {
      setSelectedId(null);
      return;
    }

    if (selectedId && displayedUsers.some((user) => user.id === selectedId)) {
      return;
    }

    const defaultSelected =
      (activeCurrentUserId &&
        displayedUsers.find((user) => user.id === activeCurrentUserId)?.id) ??
      displayedUsers[0].id;
    setSelectedId(defaultSelected);
  }, [displayedUsers, selectedId, activeCurrentUserId]);

  const displayedUserIds = useMemo(
    () => new Set(displayedUsers.map((user) => user.id)),
    [displayedUsers],
  );

  const connectableUsers = useMemo(() => {
    if (!activeCurrentUserId) {
      return [] as User[];
    }

    return users.filter((user) => {
      if (user.id === activeCurrentUserId) {
        return false;
      }

      const alreadyConnected = allRelationships.some(
        (item) =>
          (item.source === activeCurrentUserId && item.target === user.id) ||
          (item.source === user.id && item.target === activeCurrentUserId),
      );

      return !alreadyConnected;
    });
  }, [users, activeCurrentUserId, allRelationships]);

  const filteredConnectableUsers = useMemo(() => {
    const query = connectionQuery.trim().toLowerCase();
    if (!query) {
      return connectableUsers;
    }

    return connectableUsers.filter(
      (user) =>
        user.name.toLowerCase().includes(query) ||
        user.handle.toLowerCase().includes(query) ||
        user.location.toLowerCase().includes(query),
    );
  }, [connectableUsers, connectionQuery]);

  const selectedConnectionTarget = useMemo(
    () =>
      connectableUsers.find((user) => user.id === connectionTargetId) ?? null,
    [connectableUsers, connectionTargetId],
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
    () => approvedRelationships,
    [approvedRelationships],
  );

  // ensure filteredRelationships is declared before mappedNodes (used to build degree map)
  const filteredRelationships = useMemo(() => {
    return displayedRelationships.filter(
      (item) =>
        isVisibleByType(item.type, activeTypes) &&
        displayedUserIds.has(item.source) &&
        displayedUserIds.has(item.target),
    );
  }, [activeTypes, displayedRelationships, displayedUserIds]);

  const mappedNodes: Node[] = useMemo(() => {
    // Build a map of connected neighbors for better layout
    const neighborMap = new Map<string, Set<string>>();
    filteredRelationships.forEach((rel) => {
      if (!neighborMap.has(rel.source)) neighborMap.set(rel.source, new Set());
      if (!neighborMap.has(rel.target)) neighborMap.set(rel.target, new Set());
      neighborMap.get(rel.source)!.add(rel.target);
      neighborMap.get(rel.target)!.add(rel.source);
    });

    // Smart ordering: place connected nodes near each other to minimize edge crossings
    // Start with current user, then arrange others by connectivity
    const positioned = new Set<string>();
    const orderedUsers: User[] = [];

    if (activeCurrentUserId) {
      const currentUser = displayedUsers.find(
        (u) => u.id === activeCurrentUserId,
      );
      if (currentUser) {
        orderedUsers.push(currentUser);
        positioned.add(currentUser.id);
      }
    }

    // Greedily add users: next user is one that's connected to someone already positioned
    while (positioned.size < displayedUsers.length) {
      let nextUser: User | null = null;
      let bestConnections = -1;

      for (const user of displayedUsers) {
        if (positioned.has(user.id)) continue;

        // Count how many of this user's neighbors are already positioned
        const neighbors = neighborMap.get(user.id) ?? new Set();
        const connectedCount = Array.from(neighbors).filter((n) =>
          positioned.has(n),
        ).length;

        // Prefer users with more connections to positioned nodes
        if (connectedCount > bestConnections) {
          bestConnections = connectedCount;
          nextUser = user;
        }
      }

      // Fallback to any unpositioned user if none are connected
      if (!nextUser) {
        nextUser = displayedUsers.find((u) => !positioned.has(u.id)) ?? null;
      }

      if (nextUser) {
        orderedUsers.push(nextUser);
        positioned.add(nextUser.id);
      } else {
        break;
      }
    }

    // build a quick degree map
    const degreeMap = new Map<string, number>();
    filteredRelationships.forEach((rel) => {
      degreeMap.set(rel.source, (degreeMap.get(rel.source) ?? 0) + 1);
      degreeMap.set(rel.target, (degreeMap.get(rel.target) ?? 0) + 1);
    });

    // initial placement with smart ordering
    const items = orderedUsers.map((user, index) => {
      const degree = degreeMap.get(user.id) ?? 0;
      const pos = getOrganicPosition(
        index,
        orderedUsers.length,
        user.id,
        user.id === activeCurrentUserId,
        degree,
      );
      return {
        id: user.id,
        type: "person",
        data: {
          label: user.name,
          handle: user.handle,
          color: hashColor(user.id),
          isPulsing: pulsingNodeIds.includes(user.id),
          isBouncing: bouncingNodeId === user.id,
          isConnected: degree > 0,
          degree,
        },
        position: { x: pos.x, y: pos.y },
        style: { background: "transparent", border: "none", padding: 0 },
        draggable: activeCurrentUserId ? user.id === activeCurrentUserId : true,
      } as Node & { position: { x: number; y: number } };
    });

    // Build a set of connected node pairs so we can skip separation for them
    const connectedPairs = new Set<string>();
    filteredRelationships.forEach((rel) => {
      const key1 = `${rel.source}|${rel.target}`;
      const key2 = `${rel.target}|${rel.source}`;
      connectedPairs.add(key1);
      connectedPairs.add(key2);
    });

    // Enhanced collision/repulsion pass to reduce tangling
    const minDistUnconnected = 160; // clear separation for unconnected nodes
    const minDistConnected = 60; // allow connected nodes closer
    const iterations = 10; // good balance for settling

    for (let it = 0; it < iterations; it++) {
      let moved = false;
      for (let i = 0; i < items.length; i++) {
        for (let j = i + 1; j < items.length; j++) {
          const a = items[i];
          const b = items[j];

          // keep active current user anchored
          const aFixed = a.id === activeCurrentUserId;
          const bFixed = b.id === activeCurrentUserId;

          const dx = b.position.x - a.position.x;
          const dy = b.position.y - a.position.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 0.0001;

          const pairKey = `${a.id}|${b.id}`;
          const isConnected = connectedPairs.has(pairKey);
          const minDist = isConnected ? minDistConnected : minDistUnconnected;

          if (dist < minDist) {
            const overlap = (minDist - dist) / 2;
            const nx = dx / dist;
            const ny = dy / dist;

            if (!aFixed) {
              a.position.x -= nx * overlap;
              a.position.y -= ny * overlap;
              moved = true;
            }
            if (!bFixed) {
              b.position.x += nx * overlap;
              b.position.y += ny * overlap;
              moved = true;
            }

            // if one is fixed, push the other fully
            if (aFixed && !bFixed) {
              b.position.x = a.position.x + nx * minDist;
              b.position.y = a.position.y + ny * minDist;
            }
            if (bFixed && !aFixed) {
              a.position.x = b.position.x - nx * minDist;
              a.position.y = b.position.y - ny * minDist;
            }
          }
        }
      }
      if (!moved) break;
    }

    return items.map((item) => ({
      id: item.id,
      type: item.type,
      data: item.data,
      position: {
        x: Math.round(item.position.x),
        y: Math.round(item.position.y),
      },
      style: item.style,
      draggable: item.draggable,
    }));
  }, [
    displayedUsers,
    activeCurrentUserId,
    pulsingNodeIds,
    bouncingNodeId,
    filteredRelationships,
  ]);

  const graphRelationships = useMemo(
    () =>
      filteredRelationships.filter(
        (item) => parseRelationshipNote(item.note).status === "active",
      ),
    [filteredRelationships],
  );

  const graphConnectionCount = graphRelationships.length;
  const progressionMessage =
    graphConnectionCount === 0
      ? "Start building your network"
      : graphConnectionCount <= 2
        ? "Nice start"
        : graphConnectionCount <= 4
          ? "Your network is forming"
          : "Now it’s getting interesting";

  const mappedEdges: Edge[] = useMemo(() => {
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
        className: recentEdgeId === item.id ? "map-edge-reveal" : undefined,
        sourceHandle: sourceIsLeft ? "source-right" : "source-left",
        targetHandle: sourceIsLeft ? "target-left" : "target-right",
        type: "bezier",
        label: item.type,
        animated: true,
        style: {
          stroke: relationColors[item.type] ?? "#94a3b8",
          strokeWidth: 2.4,
          strokeOpacity: 0.8,
        },
        labelStyle: {
          fontSize: 10,
          fill: relationColors[item.type] ?? "#94a3b8",
          fontWeight: 600,
          fontFamily: "system-ui",
        },
        labelBgStyle: {
          fill: "rgba(8,6,22,0.8)",
          stroke: relationColors[item.type] ?? "#94a3b8",
          strokeWidth: 0.75,
          strokeOpacity: 0.55,
        },
        labelBgPadding: [6, 8] as [number, number],
        labelBgBorderRadius: 999,
      };
    });
  }, [graphRelationships, mappedNodes, recentEdgeId]);

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

    const sourceId = activeCurrentUserId ?? (await ensureCurrentUserId());

    if (!sourceId) {
      setConnectionError(
        needsAccountSync
          ? "Finishing your account setup. Please reload in a moment."
          : "Sign in to create connections.",
      );
      return;
    }

    if (sourceId === targetId) {
      setConnectionError("A user cannot connect to themselves.");
      return;
    }

    const duplicate = allRelationships.some(
      (item) =>
        (item.source === sourceId && item.target === targetId) ||
        (item.source === targetId && item.target === sourceId),
    );

    if (duplicate) {
      setConnectionError("These users are already connected.");
      return;
    }

    setIsConnecting(true);
    setConnectionError(null);

    try {
      const response = await authFetch("/api/relationships", {
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

      locallyMutatedIds.current.add(relationship.id);
      setAllRelationships((prev) => [...prev, relationship]);
      setSelectedId(relationship.target);
      triggerConnectionFeedback(relationship.id, sourceId, relationship.target);
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

    const sourceId = activeCurrentUserId ?? (await ensureCurrentUserId());

    if (!sourceId) {
      setConnectionError(
        needsAccountSync
          ? "Finishing your account setup. Please reload in a moment."
          : "Sign in to create connections.",
      );
      return;
    }

    if (connection.source !== sourceId) {
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
    const actorNodeId = activeCurrentUserId ?? (await ensureCurrentUserId());
    if (!actorNodeId) {
      setConnectionError("Sign in to edit connections.");
      return;
    }

    setIsSavingEdit(true);
    setConnectionError(null);

    try {
      const response = await authFetch("/api/relationships", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id,
          type: editingType,
          note: editingNote,
          actorNodeId,
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

      locallyMutatedIds.current.add(updated.id);
      setAllRelationships((prev) =>
        prev.map((item) => (item.id === updated.id ? updated : item)),
      );
      setEditingRelationshipId(null);
    } catch (error) {
      console.error(error);
      setConnectionError("Could not update that connection.");
    } finally {
      setIsSavingEdit(false);
    }
  }

  async function deleteRelationshipEdit(id: string) {
    const actorNodeId = activeCurrentUserId ?? (await ensureCurrentUserId());
    if (!actorNodeId) {
      setConnectionError("Sign in to delete connections.");
      return;
    }

    const confirmed = window.confirm(
      "Delete this connection? This action cannot be undone.",
    );
    if (!confirmed) {
      return;
    }

    setIsDeletingEdit(true);
    setConnectionError(null);

    try {
      const response = await authFetch("/api/relationships", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id,
          actorNodeId,
        }),
      });

      const body = (await response.json()) as {
        error?: string;
        deleted?: boolean;
        id?: string;
      };

      if (!response.ok || !body.deleted) {
        setConnectionError(body.error ?? "Could not delete that connection.");
        return;
      }

      locallyMutatedIds.current.add(id);
      setAllRelationships((prev) => prev.filter((item) => item.id !== id));
      setEditingRelationshipId(null);
      setEditingNote("");
    } catch (error) {
      console.error(error);
      setConnectionError("Could not delete that connection.");
    } finally {
      setIsDeletingEdit(false);
    }
  }

  async function respondToConnection(
    id: string,
    action: "approve" | "confirmCreator" | "reject" | "dispute",
    disputeReason?: string,
  ) {
    const actorNodeId = activeCurrentUserId ?? (await ensureCurrentUserId());
    if (!actorNodeId) {
      setConnectionError("Sign in to manage pending requests.");
      return;
    }

    const relationship = allRelationships.find((item) => item.id === id);
    const parsed = relationship
      ? parseRelationshipNote(relationship.note)
      : null;

    if (!parsed) {
      setConnectionError("This connection could not be found.");
      return;
    }

    setIsRespondingId(id);
    setConnectionError(null);

    try {
      const response = await authFetch("/api/relationships", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id,
          action,
          actorNodeId,
          note: action === "dispute" ? disputeReason : undefined,
        }),
      });

      const body = (await response.json()) as {
        error?: string;
        deleted?: boolean;
        relationship?: Relationship;
        id?: string;
      };

      if (!response.ok) {
        const message = body.error ?? "Could not update the request.";
        console.error("respondToConnection failed", {
          id,
          action,
          status: response.status,
          message,
        });
        setConnectionError(message);
        if (typeof window !== "undefined") {
          window.alert(`Could not update this request: ${message}`);
        }
        return;
      }

      if (body.relationship) {
        locallyMutatedIds.current.add(body.relationship.id);
        setAllRelationships((prev) =>
          prev.map((item) =>
            item.id === body.relationship?.id ? body.relationship : item,
          ),
        );

        if (action === "confirmCreator" || action === "approve") {
          // Keep claim/profile/map views in sync after state transitions.
          router.refresh();
        }
      }
    } catch (error) {
      console.error(error);
      const message = "Could not update the request.";
      setConnectionError(message);
      if (typeof window !== "undefined") {
        window.alert(message);
      }
    } finally {
      setIsRespondingId(null);
    }
  }

  async function disputeConnection(id: string) {
    const reason = window
      .prompt(
        "Report/dispute this claim. Add a short reason (optional):",
        "Possible impersonation or false claim",
      )
      ?.trim();

    await respondToConnection(id, "dispute", reason || undefined);
  }

  async function reportNode(userId: string, userName: string) {
    const actorNodeId = activeCurrentUserId ?? (await ensureCurrentUserId());
    if (!actorNodeId) {
      setConnectionError("Sign in to report a node.");
      return;
    }

    if (actorNodeId === userId) {
      setConnectionError("You cannot report your own node.");
      return;
    }

    const reason = window
      .prompt(
        `Report ${userName}. Add a short reason (optional):`,
        "Spam or fake profile",
      )
      ?.trim();

    setReportingUserId(userId);
    setConnectionError(null);

    try {
      const response = await authFetch("/api/relationships/report", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          nodeId: userId,
          reason: reason || undefined,
        }),
      });

      const body = (await response.json()) as {
        error?: string;
        success?: boolean;
      };

      if (!response.ok || !body.success) {
        setConnectionError(body.error ?? "Could not submit report right now.");
        return;
      }

      window.alert("Report submitted. Thank you for flagging this node.");
    } catch {
      setConnectionError("Could not submit report right now.");
    } finally {
      setReportingUserId(null);
    }
  }

  const selectedUser = displayedUsers.find((user) => user.id === selectedId);
  const selectedConnections = filteredRelationships.filter(
    (item) => item.source === selectedId || item.target === selectedId,
  );
  const pendingRequests = useMemo(() => {
    if (!activeCurrentUserId) {
      return [] as Relationship[];
    }

    return allRelationships.filter((item) => {
      const parsed = parseRelationshipNote(item.note);
      if (
        parsed.status !== "pending_claim" &&
        parsed.status !== "pending_creator_confirmation"
      ) {
        return false;
      }
      return (
        parsed.creatorId === activeCurrentUserId ||
        parsed.claimedByUserId === activeCurrentUserId
      );
    });
  }, [allRelationships, activeCurrentUserId]);

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
            Private Chart
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
            Public Chart
          </button>
        </div>
        <p className="mt-2 text-xs text-black/60 dark:text-white/60">
          Direct connections are always visible to you. Extended exploration
          shows up to 25 confirmed connections for free.
        </p>
      </div>

      {chartLayer === "private" && activeCurrentUserId ? (
        <PrivateChart
          initialPlaceholders={privatePlaceholders}
          baseUrl={baseUrl}
          currentUserId={activeCurrentUserId}
          approvedConnections={approvedUserConnections}
          users={users}
        />
      ) : null}

      {chartLayer === "private" && !activeCurrentUserId ? (
        <section
          className="rounded-2xl border border-white/10 p-6 text-center"
          style={{
            background: "linear-gradient(145deg, #0f0819 0%, #160d28 100%)",
          }}
        >
          <p className="text-sm font-semibold text-white">
            {needsAccountSync
              ? "Setting up your network"
              : "Sign in to save your direct connections"}
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
              {(Object.keys(relationColors) as RelationshipType[]).map(
                (type) => {
                  const active = activeTypes.includes(type);
                  return (
                    <button
                      type="button"
                      key={type}
                      onClick={() =>
                        setActiveTypes((prev) =>
                          prev.includes(type)
                            ? prev.filter((item) => item !== type)
                            : [...prev, type],
                        )
                      }
                      className="rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide transition"
                      style={{
                        borderColor: active
                          ? relationColors[type]
                          : "var(--border-soft)",
                        backgroundColor: active
                          ? `${relationColors[type]}20`
                          : "transparent",
                      }}
                    >
                      {type}
                    </button>
                  );
                },
              )}
            </div>
            <p className="mb-3 text-xs text-black/65 dark:text-white/70">
              Use the side form to connect with an existing member, or drag from
              your node to another member.
            </p>
            <p className="mb-3 rounded-lg border border-[var(--border-soft)] bg-black/[0.03] px-3 py-2 text-[11px] text-black/70 dark:bg-white/[0.05] dark:text-white/75">
              Every public connection shown here was created and verified by
              both parties.
            </p>
            <div className="mb-3 flex flex-col gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-white/90 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-medium">
                Add someone to begin your network
              </p>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-white/80">
                  Connections: {graphConnectionCount}
                </p>
                <p className="text-[11px] text-white/60">
                  {progressionMessage}
                </p>
              </div>
            </div>
            {hasDbUser ? null : (
              <p className="mb-3 text-xs text-black/65 dark:text-white/70">
                {isResolvingCurrentUserId
                  ? "Checking your account status..."
                  : needsAccountSync
                    ? "Your account is signed in and syncing. Reload shortly to manage connections."
                    : "Sign in to create and edit your own connections."}
              </p>
            )}
            {connectionError ? (
              <p className="mb-3 text-sm text-red-700 dark:text-red-400">
                {connectionError}
              </p>
            ) : null}
            <div
              className="relative h-[520px] overflow-hidden rounded-2xl border border-[var(--border-soft)]"
              style={{ background: "#0f0819" }}
            >
              <div className="pointer-events-none absolute inset-0 z-0">
                <span className="map-bg-dot map-bg-dot-1" aria-hidden="true" />
                <span className="map-bg-dot map-bg-dot-2" aria-hidden="true" />
                <span className="map-bg-dot map-bg-dot-3" aria-hidden="true" />
                <span className="map-bg-dot map-bg-dot-4" aria-hidden="true" />
              </div>
              <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                fitView={chartLayer === "public"}
                onNodeClick={(_, node) => setSelectedId(node.id)}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                minZoom={0.2}
                maxZoom={1.8}
                connectOnClick={false}
                className="relative z-10"
              >
                <Controls showInteractive={false} />
                <Background gap={24} size={1} color="rgba(255,255,255,0.07)" />
              </ReactFlow>
            </div>
          </section>

          <aside className="paper-card rounded-2xl p-5">
            <div className="rounded-xl border border-[var(--border-soft)] p-3">
              <h4 className="text-sm font-semibold uppercase tracking-wide">
                Grow Your Network
              </h4>
              <p className="mt-1 text-xs text-black/65 dark:text-white/70">
                Every person you add reveals more connections.
              </p>
              {activeCurrentUserId ? (
                <form
                  className="mt-3 space-y-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const targetId =
                      selectedConnectionTarget?.id ??
                      filteredConnectableUsers[0]?.id ??
                      "";
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
                  <div className="rounded-lg border border-[var(--border-soft)] bg-black/[0.02] p-2 dark:bg-white/[0.04]">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-black/65 dark:text-white/70">
                      Suggestions
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {[
                        "Add your best friend",
                        "Add your partner",
                        "Add someone you used to date",
                      ].map((suggestion) => (
                        <button
                          key={suggestion}
                          type="button"
                          onClick={() =>
                            setConnectionQuery(
                              suggestion.replace(/^Add\s+/i, ""),
                            )
                          }
                          className="rounded-full border border-[var(--border-soft)] px-2.5 py-1 text-[11px] text-black/75 transition hover:bg-black/5 dark:text-white/75 dark:hover:bg-white/10"
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  </div>
                  {connectableUsers.length === 0 ? (
                    <p className="text-xs text-black/60 dark:text-white/70">
                      No available members to connect with.
                    </p>
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
                            <span className="text-xs text-black/60 dark:text-white/70">
                              @{user.handle}
                            </span>
                          </button>
                        );
                      })}
                      {filteredConnectableUsers.length === 0 ? (
                        <p className="px-2 py-1 text-xs text-black/60 dark:text-white/70">
                          No matches found.
                        </p>
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
                    onChange={(event) =>
                      setConnectionType(event.target.value as RelationshipType)
                    }
                    className="w-full rounded-lg border border-[var(--border-soft)] bg-transparent px-2 py-2 text-sm outline-none"
                    disabled={isConnecting}
                  >
                    {(Object.keys(relationColors) as RelationshipType[]).map(
                      (type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ),
                    )}
                  </select>
                  <button
                    type="submit"
                    disabled={
                      (!selectedConnectionTarget &&
                        filteredConnectableUsers.length === 0) ||
                      isConnecting ||
                      connectableUsers.length === 0
                    }
                    className="w-full rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {isConnecting ? "Creating..." : "Create connection"}
                  </button>
                  <p className="text-[11px] text-black/65 dark:text-white/70">
                    By creating this connection, you confirm this information is
                    accurate to the best of your knowledge.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      if (!activeCurrentUserId) {
                        setConnectionError(
                          "Sign in to manage and edit your node changes.",
                        );
                        return;
                      }
                      setSelectedId(activeCurrentUserId);
                      if (typeof window !== "undefined") {
                        window.setTimeout(() => {
                          document
                            .getElementById("node-management")
                            ?.scrollIntoView({
                              behavior: "smooth",
                              block: "start",
                            });
                        }, 0);
                      }
                    }}
                    className="block w-full rounded-lg border border-[var(--border-soft)] px-3 py-2 text-center text-sm font-semibold text-black/75 transition hover:bg-black/5 dark:text-white/80 dark:hover:bg-white/10"
                  >
                    Manage Connections
                  </button>
                </form>
              ) : (
                <p className="mt-2 text-xs text-black/65 dark:text-white/70">
                  {isResolvingCurrentUserId || !hasAttemptedUserBootstrap
                    ? "Checking your account status..."
                    : needsAccountSync
                      ? "Signed in. Finalizing account sync..."
                      : "Sign in to create and manage your connections."}
                </p>
              )}
            </div>

            {activeCurrentUserId ? (
              <div
                id="pending-verification"
                className="mt-4 rounded-xl border border-[var(--border-soft)] p-3"
              >
                <h4 className="text-sm font-semibold uppercase tracking-wide">
                  Pending Verification
                </h4>
                {pendingRequests.length === 0 ? (
                  <p className="mt-2 text-xs text-black/65 dark:text-white/70">
                    No pending verifications.
                  </p>
                ) : (
                  <>
                    {connectionError ? (
                      <p className="mt-2 text-xs text-red-700 dark:text-red-400">
                        {connectionError}
                      </p>
                    ) : null}
                    <div className="mt-3 space-y-2">
                      {pendingRequests.map((item) => {
                        const parsed = parseRelationshipNote(item.note);
                        const otherUserId =
                          item.source === activeCurrentUserId
                            ? item.target
                            : item.source;
                        const otherUser = users.find(
                          (user) => user.id === otherUserId,
                        );
                        const isClaimedUserTurn =
                          parsed.status === "pending_claim" &&
                          parsed.claimedByUserId === activeCurrentUserId;
                        const isCreatorTurn =
                          parsed.status === "pending_creator_confirmation" &&
                          parsed.creatorId === activeCurrentUserId;
                        const waitingForOtherUser =
                          parsed.status === "pending_claim"
                            ? parsed.claimedByUserId !== activeCurrentUserId
                            : parsed.creatorId !== activeCurrentUserId;

                        return (
                          <div
                            key={item.id}
                            className="rounded-lg border border-[var(--border-soft)] p-2.5"
                          >
                            <div className="flex items-center gap-2">
                              <Avatar
                                name={otherUser?.name ?? "Member"}
                                src={otherUser?.profileImage ?? undefined}
                                className="h-9 w-9"
                              />
                              <div>
                                <p className="text-sm font-semibold">
                                  {otherUser?.name ?? "Member"}
                                </p>
                                <p className="text-[11px] text-black/65 dark:text-white/70">
                                  @{otherUser?.handle ?? "member"}
                                </p>
                              </div>
                            </div>
                            <p className="text-xs uppercase tracking-wide text-[var(--accent)]">
                              {item.type}
                            </p>
                            <p className="mt-1 text-[11px] text-black/65 dark:text-white/70">
                              {isClaimedUserTurn
                                ? "Confirm this is your profile for this connection."
                                : isCreatorTurn
                                  ? "Is this the correct person you intended to connect with?"
                                  : waitingForOtherUser
                                    ? "Waiting for the other person to verify."
                                    : "Pending review."}
                            </p>
                            {parsed.status === "pending_creator_confirmation" &&
                            parsed.expiresAt ? (
                              <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-300">
                                Expires: {formatUtcDateTime(parsed.expiresAt)}
                              </p>
                            ) : null}
                            <div className="mt-2 flex flex-wrap gap-2">
                              {isClaimedUserTurn ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    respondToConnection(item.id, "approve")
                                  }
                                  disabled={isRespondingId === item.id}
                                  className="rounded-full bg-[var(--accent)] px-3 py-1 text-xs font-semibold text-white disabled:opacity-70"
                                >
                                  Verify — this is me
                                </button>
                              ) : null}
                              {isCreatorTurn ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    respondToConnection(
                                      item.id,
                                      "confirmCreator",
                                    )
                                  }
                                  disabled={isRespondingId === item.id}
                                  className="rounded-full bg-[var(--accent)] px-3 py-1 text-xs font-semibold text-white disabled:opacity-70"
                                >
                                  Yes, that&apos;s them — make public
                                </button>
                              ) : null}
                              {waitingForOtherUser ? (
                                <span className="rounded-full border border-[var(--border-soft)] px-3 py-1 text-xs text-black/60 dark:text-white/60">
                                  Waiting for{" "}
                                  {otherUser?.name ?? "the other person"}
                                </span>
                              ) : null}
                              {isClaimedUserTurn || isCreatorTurn ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    respondToConnection(item.id, "reject")
                                  }
                                  disabled={isRespondingId === item.id}
                                  className="rounded-full border border-[var(--border-soft)] px-3 py-1 text-xs font-semibold disabled:opacity-70"
                                >
                                  Reject
                                </button>
                              ) : null}
                              {isClaimedUserTurn || isCreatorTurn ? (
                                <button
                                  type="button"
                                  onClick={() => disputeConnection(item.id)}
                                  disabled={isRespondingId === item.id}
                                  className="rounded-full border border-red-500/40 px-3 py-1 text-xs font-semibold text-red-700 disabled:opacity-70 dark:text-red-300"
                                >
                                  Report / Dispute
                                </button>
                              ) : null}
                            </div>
                            {isClaimedUserTurn ? (
                              <p className="mt-2 text-[11px] text-black/70 dark:text-white/75">
                                This confirms your identity only. The connection
                                stays hidden until the creator confirms.
                              </p>
                            ) : null}
                            {isCreatorTurn ? (
                              <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-300">
                                Confirming publishes this connection. Reject
                                keeps it hidden.
                              </p>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            ) : null}

            {activeCurrentUserId ? (
              <div id="node-management" className="mt-4">
                {selectedUser ? (
                  <>
                    <div className="flex items-center gap-3">
                      <Avatar
                        name={selectedUser.name}
                        src={selectedUser.profileImage ?? undefined}
                        className="h-14 w-14"
                      />
                      <div>
                        <h3 className="text-xl font-semibold">
                          {selectedUser.name}
                        </h3>
                        <p className="text-sm text-black/65 dark:text-white/75">
                          @{selectedUser.handle}
                        </p>
                      </div>
                    </div>
                    <p className="mt-3 text-sm text-black/80 dark:text-white/85">
                      {selectedUser.bio}
                    </p>
                    <p className="mt-2 text-xs text-black/65 dark:text-white/70">
                      Status: {selectedUser.relationshipStatus}
                    </p>
                    {activeCurrentUserId &&
                    selectedUser.id !== activeCurrentUserId ? (
                      <button
                        type="button"
                        onClick={() =>
                          reportNode(selectedUser.id, selectedUser.name)
                        }
                        disabled={reportingUserId === selectedUser.id}
                        className="mt-3 rounded-full border border-red-500/40 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-60 dark:text-red-300 dark:hover:bg-red-950/30"
                      >
                        {reportingUserId === selectedUser.id
                          ? "Reporting..."
                          : "Report node"}
                      </button>
                    ) : null}

                    <div className="mt-5 space-y-2">
                      <h4 className="text-sm font-semibold uppercase tracking-wide">
                        {selectedUser.id === activeCurrentUserId
                          ? "Your Direct Connections"
                          : `${selectedUser.name}'s Public Connections`}
                      </h4>
                      {selectedUser.id !== activeCurrentUserId ? (
                        <p className="text-xs text-black/65 dark:text-white/70">
                          You are viewing this member&apos;s visible public
                          connections.
                        </p>
                      ) : null}
                      {isConnecting ? (
                        <p className="text-xs text-black/65 dark:text-white/70">
                          Saving new connection...
                        </p>
                      ) : null}
                      {selectedConnections.length === 0 ? (
                        <p className="text-xs text-black/65 dark:text-white/70">
                          {selectedUser.id === activeCurrentUserId
                            ? "You do not have any public direct connections yet."
                            : `${selectedUser.name} does not have any visible public direct connections.`}
                        </p>
                      ) : null}
                      {selectedConnections.map((item) => {
                        const targetId =
                          item.source === selectedUser.id
                            ? item.target
                            : item.source;
                        const target = users.find(
                          (user) => user.id === targetId,
                        );
                        const parsed = parseRelationshipNote(item.note);
                        const canEdit = Boolean(
                          activeCurrentUserId &&
                          selectedUser.id === activeCurrentUserId &&
                          parsed.status === "active" &&
                          (item.source === activeCurrentUserId ||
                            item.target === activeCurrentUserId),
                        );
                        const isEditing = editingRelationshipId === item.id;

                        return (
                          <div
                            key={item.id}
                            className="rounded-xl border border-[var(--border-soft)] p-3"
                          >
                            <p className="font-semibold">{target?.name}</p>
                            {isEditing ? (
                              <>
                                <select
                                  value={editingType}
                                  onChange={(event) =>
                                    setEditingType(
                                      event.target.value as RelationshipType,
                                    )
                                  }
                                  className="mt-1 w-full rounded-lg border border-[var(--border-soft)] bg-transparent px-2 py-1 text-xs uppercase tracking-wide outline-none"
                                >
                                  {(
                                    Object.keys(
                                      relationColors,
                                    ) as RelationshipType[]
                                  ).map((type) => (
                                    <option key={type} value={type}>
                                      {type}
                                    </option>
                                  ))}
                                </select>
                                <textarea
                                  value={editingNote}
                                  onChange={(event) =>
                                    setEditingNote(event.target.value)
                                  }
                                  rows={2}
                                  className="mt-2 w-full rounded-lg border border-[var(--border-soft)] bg-transparent px-2 py-1 text-xs outline-none"
                                  placeholder="Add a note"
                                />
                                <div className="mt-2 flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      saveRelationshipEdit(item.id)
                                    }
                                    disabled={isSavingEdit || isDeletingEdit}
                                    className="rounded-full bg-[var(--accent)] px-3 py-1 text-xs font-semibold text-white disabled:opacity-70"
                                  >
                                    {isSavingEdit ? "Saving..." : "Save"}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      deleteRelationshipEdit(item.id)
                                    }
                                    disabled={isSavingEdit || isDeletingEdit}
                                    className="rounded-full border border-red-500/40 px-3 py-1 text-xs font-semibold text-red-600 disabled:opacity-70 dark:text-red-300"
                                  >
                                    {isDeletingEdit ? "Deleting..." : "Delete"}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={cancelEditing}
                                    disabled={isSavingEdit || isDeletingEdit}
                                    className="rounded-full border border-[var(--border-soft)] px-3 py-1 text-xs font-semibold"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </>
                            ) : (
                              <>
                                <p className="text-xs uppercase tracking-wide text-[var(--accent)]">
                                  {item.type}
                                </p>
                                <p className="mt-1 text-xs text-black/65 dark:text-white/75">
                                  {parsed.note}
                                </p>
                                {parsed.status === "pending_claim" ||
                                parsed.status ===
                                  "pending_creator_confirmation" ? (
                                  <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                                    Pending verification
                                  </p>
                                ) : null}
                                {parsed.status === "expired" ? (
                                  <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">
                                    Claim expired
                                  </p>
                                ) : null}
                                {parsed.status === "rejected" ? (
                                  <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-red-700 dark:text-red-300">
                                    Claim rejected
                                  </p>
                                ) : null}
                                {parsed.status === "disputed" ? (
                                  <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-red-700 dark:text-red-300">
                                    Claim disputed
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
                                {activeCurrentUserId ? (
                                  <div className="mt-2 flex flex-wrap gap-2">
                                    {item.source === activeCurrentUserId ||
                                    item.target === activeCurrentUserId ? (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          deleteRelationshipEdit(item.id)
                                        }
                                        disabled={
                                          isDeletingEdit || isSavingEdit
                                        }
                                        className="rounded-full border border-red-500/40 px-3 py-1 text-xs font-semibold text-red-700 disabled:opacity-60 dark:text-red-300"
                                      >
                                        {isDeletingEdit
                                          ? "Removing..."
                                          : "Remove connection"}
                                      </button>
                                    ) : null}
                                    <Link
                                      href={`/report?link=${encodeURIComponent(`/map?connectionId=${item.id}`)}&reason=${encodeURIComponent("Please review this connection.")}`}
                                      className="rounded-full border border-[var(--border-soft)] px-3 py-1 text-xs font-semibold transition hover:bg-black/5 dark:hover:bg-white/10"
                                    >
                                      Report connection
                                    </Link>
                                  </div>
                                ) : null}
                                {parsed.status === "active" &&
                                activeCurrentUserId ? (
                                  <div className="mt-2 flex flex-wrap gap-2">
                                    <span className="rounded-full bg-green-100 px-3 py-1 text-[11px] font-semibold text-green-700 dark:bg-green-900/30 dark:text-green-300">
                                      Confirmed in network
                                    </span>
                                  </div>
                                ) : null}
                                {activeCurrentUserId &&
                                (parsed.status === "pending_claim" ||
                                  parsed.status ===
                                    "pending_creator_confirmation") ? (
                                  <div className="mt-2 flex flex-wrap gap-2">
                                    {selectedUser.id === activeCurrentUserId &&
                                    parsed.status === "pending_claim" &&
                                    parsed.claimedByUserId ===
                                      activeCurrentUserId ? (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          respondToConnection(
                                            item.id,
                                            "approve",
                                          )
                                        }
                                        disabled={isRespondingId === item.id}
                                        className="rounded-full bg-[var(--accent)] px-3 py-1 text-xs font-semibold text-white disabled:opacity-70"
                                      >
                                        Verify claim
                                      </button>
                                    ) : null}
                                    {selectedUser.id === activeCurrentUserId &&
                                    parsed.status ===
                                      "pending_creator_confirmation" &&
                                    parsed.creatorId === activeCurrentUserId ? (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          respondToConnection(
                                            item.id,
                                            "confirmCreator",
                                          )
                                        }
                                        disabled={isRespondingId === item.id}
                                        className="rounded-full bg-[var(--accent)] px-3 py-1 text-xs font-semibold text-white disabled:opacity-70"
                                      >
                                        Confirm &amp; make public
                                      </button>
                                    ) : null}
                                    {selectedUser.id === activeCurrentUserId &&
                                    parsed.status ===
                                      "pending_creator_confirmation" &&
                                    parsed.claimedByUserId ===
                                      activeCurrentUserId ? (
                                      <span className="rounded-full border border-[var(--border-soft)] px-3 py-1 text-xs text-black/60 dark:text-white/60">
                                        Waiting for creator to confirm
                                      </span>
                                    ) : null}
                                    {selectedUser.id === activeCurrentUserId &&
                                    ((parsed.status === "pending_claim" &&
                                      (parsed.claimedByUserId ===
                                        activeCurrentUserId ||
                                        parsed.creatorId ===
                                          activeCurrentUserId)) ||
                                      (parsed.status ===
                                        "pending_creator_confirmation" &&
                                        parsed.creatorId ===
                                          activeCurrentUserId)) ? (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          respondToConnection(item.id, "reject")
                                        }
                                        disabled={isRespondingId === item.id}
                                        className="rounded-full border border-[var(--border-soft)] px-3 py-1 text-xs font-semibold disabled:opacity-70"
                                      >
                                        Reject
                                      </button>
                                    ) : null}
                                    {selectedUser.id === activeCurrentUserId ? (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          disputeConnection(item.id)
                                        }
                                        disabled={isRespondingId === item.id}
                                        className="rounded-full border border-red-500/40 px-3 py-1 text-xs font-semibold text-red-700 disabled:opacity-70 dark:text-red-300"
                                      >
                                        Report / Dispute
                                      </button>
                                    ) : null}
                                  </div>
                                ) : null}
                                {selectedUser.id === activeCurrentUserId &&
                                parsed.status === "pending_claim" &&
                                parsed.claimedByUserId ===
                                  activeCurrentUserId ? (
                                  <p className="mt-2 text-[11px] text-black/70 dark:text-white/75">
                                    Verifying keeps it private until the creator
                                    confirms.
                                  </p>
                                ) : null}
                                {selectedUser.id === activeCurrentUserId &&
                                parsed.status ===
                                  "pending_creator_confirmation" &&
                                parsed.creatorId === activeCurrentUserId ? (
                                  <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-300">
                                    Confirming makes this connection public.
                                    Reject keeps it hidden.
                                  </p>
                                ) : null}
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <p className="text-sm">
                    Select a node to preview member details.
                  </p>
                )}
              </div>
            ) : null}
          </aside>
        </div>
      ) : null}
    </div>
  );
}
