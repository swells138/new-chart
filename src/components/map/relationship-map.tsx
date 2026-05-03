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
import { Info } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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

const FREE_EXTENDED_NODE_LIMIT = 15;

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
  profileImage?: string | null;
  isPulsing?: boolean;
  isBouncing?: boolean;
  isConnected?: boolean;
  isLocked?: boolean;
  degree?: number;
};

function PersonNode({
  data,
  selected,
}: {
  data: PersonNodeData & { isPro?: boolean; isPathNode?: boolean; dimmed?: boolean };
  selected?: boolean;
}) {
  const initial = (data.label?.[0] ?? "?").toUpperCase();
  const displayName = data.label.split(" ")[0] ?? data.label;
  const isPathNode = Boolean(data.isPathNode);
  const isDimmed = Boolean(data.dimmed);
  const isLocked = Boolean(data.isLocked);

  // base visual adjustments
  const nodeBorder = selected || isPathNode ? `2px solid ${data.color}` : "1px solid rgba(255,255,255,0.06)";
  const nodeTransform = selected || isPathNode ? "translateY(-1px) scale(1.06)" : "translateY(0) scale(1)";
  const nodeBoxShadow = isPathNode
    ? `0 8px 26px ${data.color}33`
    : data.isPulsing
      ? `0 6px 18px ${data.color}22`
      : `0 2px 6px rgba(2,6,23,0.18)`;

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
      <div
        style={{
          textAlign: "center",
          width: 86,
          opacity: isDimmed ? 0.28 : isLocked ? 0.58 : 1,
        }}
      >
        <div style={{ display: "flex", justifyContent: "center" }}>
          <div style={{ position: "relative", display: "inline-block" }}>
            <div
              className={data.isBouncing ? "map-node-bounce" : undefined}
              style={{
                width: 40,
                height: 40,
                borderRadius: "50%",
                background: data.color,
                boxShadow: nodeBoxShadow,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto",
                border: nodeBorder,
                transition: "transform 0.18s ease, box-shadow 0.18s ease, opacity 0.18s ease",
                transform: nodeTransform,
                position: "relative",
                zIndex: isPathNode ? 3 : 2,
                overflow: "hidden",
                filter: isLocked ? "blur(3px) saturate(0.75)" : undefined,
              }}
            >
              {data.profileImage ? (
                <Avatar
                  name={data.label}
                  src={data.profileImage}
                  className="h-full w-full"
                />
              ) : (
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
              )}
            </div>
            {isLocked ? (
              <div
                style={{
                  position: "absolute",
                  inset: -4,
                  borderRadius: "50%",
                  border: "1px solid rgba(255,255,255,0.22)",
                  background: "rgba(8,6,22,0.2)",
                  backdropFilter: "blur(1px)",
                  zIndex: 4,
                }}
              />
            ) : null}
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
              color: isLocked ? "rgba(255,255,255,0.54)" : "rgba(255,255,255,0.9)",
              fontSize: 11,
              fontWeight: 600,
              fontFamily: "system-ui",
              userSelect: "none",
            }}
          >
            {isLocked ? "Pro" : displayName}
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

function normalizeConnectionSearchValue(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase().replace(/^@+/, "");
}

function getConnectionSearchTokens(user: User) {
  const handle = normalizeConnectionSearchValue(user.handle);

  return [
    user.name,
    user.firstName,
    user.lastName,
    user.handle,
    handle ? `@${handle}` : "",
    user.location,
  ].map(normalizeConnectionSearchValue);
}

function findShortestConnectionPath(
  relationships: Relationship[],
  startUserId: string | null | undefined,
  targetUserId: string | null | undefined,
): { degree: number; path: string[] } | null {
  if (!startUserId || !targetUserId) {
    return null;
  }

  if (startUserId === targetUserId) {
    return { degree: 0, path: [startUserId] };
  }

  const neighborsByUserId = new Map<string, Set<string>>();

  relationships.forEach((relationship) => {
    if (!neighborsByUserId.has(relationship.source)) {
      neighborsByUserId.set(relationship.source, new Set());
    }
    if (!neighborsByUserId.has(relationship.target)) {
      neighborsByUserId.set(relationship.target, new Set());
    }

    neighborsByUserId.get(relationship.source)?.add(relationship.target);
    neighborsByUserId.get(relationship.target)?.add(relationship.source);
  });

  const parentByUserId = new Map<string, string | null>([
    [startUserId, null],
  ]);
  const queue = [startUserId];

  while (queue.length > 0) {
    const currentUserId = queue.shift();
    if (!currentUserId) {
      continue;
    }

    const neighbors = neighborsByUserId.get(currentUserId) ?? new Set<string>();
    for (const neighborId of neighbors) {
      if (parentByUserId.has(neighborId)) {
        continue;
      }

      parentByUserId.set(neighborId, currentUserId);

      if (neighborId === targetUserId) {
        const path: string[] = [];
        let pathUserId: string | null = targetUserId;

        while (pathUserId) {
          path.push(pathUserId);
          pathUserId = parentByUserId.get(pathUserId) ?? null;
        }

        path.reverse();
        return { degree: path.length - 1, path };
      }

      queue.push(neighborId);
    }
  }

  return null;
}

function isObviousTestProfile(user: User) {
  const values = [user.name, user.handle, user.firstName, user.lastName].map(
    normalizeConnectionSearchValue,
  );
  return values.some((value) =>
    ["mctester", "titesti", "exact match", "exactmatch"].includes(value),
  );
}

interface Props {
  users: User[];
  relationships: Relationship[];
  currentUserId: string | null;
  isSignedIn?: boolean;
  currentUserIsPro?: boolean;
  userConnections?: Relationship[];
  privatePlaceholders?: PlaceholderPerson[];
  baseUrl?: string;
  afterGraph?: ReactNode;
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
  currentUserIsPro = false,
  userConnections,
  privatePlaceholders = [],
  baseUrl = "",
  afterGraph,
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [connectionTargetId, setConnectionTargetId] = useState<string>("");
  const [connectionQuery, setConnectionQuery] = useState<string>("");
  const [connectionType, setConnectionType] =
    useState<RelationshipType>("Friends");
  // STEP 1: search UI state
  const [searchValue, setSearchValue] = useState("");
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [hasSearchedUsers, setHasSearchedUsers] = useState(false);
  // store the user selected from search (local state, separate from existing selectedId)
  const [searchSelectedUser, setSearchSelectedUser] = useState<User | null>(null);
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
  const [clientPrivateConnectionCount, setClientPrivateConnectionCount] =
    useState(privatePlaceholders.length);
  const [clientCreatedConnectionCount, setClientCreatedConnectionCount] =
    useState(0);
  const [showSecondaryActions, setShowSecondaryActions] = useState(false);
  const [isOnboardingDismissed, setIsOnboardingDismissed] = useState(false);
  // Whether the active user has an active Pro subscription. Populated from
  // /api/profile when we resolve the current DB user.
  const [hasPro, setHasPro] = useState(currentUserIsPro);
  const [browserClerkImageUrl, setBrowserClerkImageUrl] = useState<
    string | null
  >(null);
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
  const usersWithCurrentClerkImage = useMemo(() => {
    if (!activeCurrentUserId || !browserClerkImageUrl) {
      return users;
    }

    return users.map((user) =>
      user.id === activeCurrentUserId
        ? { ...user, profileImage: browserClerkImageUrl }
        : user,
    );
  }, [users, activeCurrentUserId, browserClerkImageUrl]);
  const visibleDirectoryUsers = useMemo(
    () =>
      usersWithCurrentClerkImage.filter(
        (user) =>
          user.id === activeCurrentUserId || !isObviousTestProfile(user),
      ),
    [usersWithCurrentClerkImage, activeCurrentUserId],
  );
  const isSignedInEffective = Boolean(isSignedIn || hasBrowserSession);
  const needsAccountSync = isSignedInEffective && !hasDbUser;

  function searchLoadedUsers() {
    const query = normalizeConnectionSearchValue(searchValue);
    setHasSearchedUsers(true);
    setSearchSelectedUser(null);

    if (!query) {
      setSearchResults([]);
      return;
    }

    const matches = visibleDirectoryUsers.filter((user) =>
      getConnectionSearchTokens(user).some((token) => token.includes(query)),
    );
    setSearchResults(matches);
    setSearchSelectedUser(matches[0] ?? null);
  }

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

      const maybeClerk = (
        window as Window & {
          Clerk?: {
            user?: {
              imageUrl?: string | null;
            };
          };
        }
      ).Clerk;
      if (!cancelled) {
        setBrowserClerkImageUrl(maybeClerk?.user?.imageUrl ?? null);
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
    setHasPro(currentUserIsPro);
  }, [currentUserIsPro]);

  useEffect(() => {
    setClientPrivateConnectionCount(privatePlaceholders.length);
  }, [privatePlaceholders.length]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    setIsOnboardingDismissed(
      window.localStorage.getItem("meshy-map-onboarding-dismissed") === "true",
    );
  }, []);

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
          profile?: {
            id?: string;
            isPro?: boolean;
            hasPro?: boolean;
            pro?: { active?: boolean };
          };
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
        // Accept a few possible shapes from the API: isPro, hasPro, or nested
        // pro.active. If present, update local state so UI can show Pro UX.
        const profileIsPro =
          Boolean(body.profile?.isPro) ||
          Boolean(body.profile?.hasPro) ||
          Boolean(body.profile?.pro?.active);
        setHasPro(profileIsPro);
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

  const personalConnectionCount =
    approvedUserConnections.length +
    clientPrivateConnectionCount +
    clientCreatedConnectionCount;
  const showOnboardingOverlay =
    personalConnectionCount === 0 && !isOnboardingDismissed;

  const networkAccess = useMemo(() => {
    if (!activeCurrentUserId) {
      return {
        nodeIds: new Set<string>(),
        lockedNodeIds: new Set<string>(),
        lockedCount: 0,
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

    const lockedExtendedIds = hasPro
      ? []
      : orderedExtendedIds.slice(FREE_EXTENDED_NODE_LIMIT);

    return {
      nodeIds: new Set<string>([
        activeCurrentUserId,
        ...Array.from(directIds),
        ...orderedExtendedIds,
      ]),
      lockedNodeIds: new Set<string>(lockedExtendedIds),
      lockedCount: lockedExtendedIds.length,
      totalExtendedCount: orderedExtendedIds.length,
    };
  }, [
    approvedRelationships,
    approvedUserConnections,
    activeCurrentUserId,
    hasPro,
    users,
  ]);

  // Determine which users to display based on view mode
  const displayedUsers = useMemo(() => {
    if (chartLayer === "private" && activeCurrentUserId) {
      return visibleDirectoryUsers.filter((user) =>
        networkAccess.nodeIds.has(user.id),
      );
    }

    // Public view: show users that currently have at least one visible connection.
    const visiblePublicRelationships = approvedRelationships.filter((item) =>
      isVisibleByType(item.type, activeTypes),
    );

    const baseUsers = visibleDirectoryUsers;
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
    visibleDirectoryUsers,
    chartLayer,
    activeCurrentUserId,
    networkAccess,
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

    setSelectedId(null);
  }, [displayedUsers, selectedId]);

  const displayedUserIds = useMemo(
    () => new Set(displayedUsers.map((user) => user.id)),
    [displayedUsers],
  );

  const connectableUsers = useMemo(() => {
    if (!activeCurrentUserId) {
      return [] as User[];
    }

    return visibleDirectoryUsers.filter((user) => {
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
  }, [visibleDirectoryUsers, activeCurrentUserId, allRelationships]);

  const filteredConnectableUsers = useMemo(() => {
    const query = normalizeConnectionSearchValue(connectionQuery);
    if (!query) {
      return connectableUsers;
    }

    return connectableUsers.filter((user) =>
      getConnectionSearchTokens(user).some((token) => token.includes(query)),
    );
  }, [connectableUsers, connectionQuery]);

  const selectedFilteredConnectionTarget = useMemo(
    () =>
      filteredConnectableUsers.find((user) => user.id === connectionTargetId) ??
      null,
    [filteredConnectableUsers, connectionTargetId],
  );

  useEffect(() => {
    if (filteredConnectableUsers.length === 0) {
      setConnectionTargetId("");
      return;
    }

    if (
      filteredConnectableUsers.some((user) => user.id === connectionTargetId)
    ) {
      return;
    }

    setConnectionTargetId(filteredConnectableUsers[0].id);
  }, [filteredConnectableUsers, connectionTargetId]);

  const displayedRelationships = useMemo(
    () => approvedRelationships,
    [approvedRelationships],
  );

  const filteredRelationships = useMemo(() => {
    return displayedRelationships.filter(
      (item) =>
        isVisibleByType(item.type, activeTypes) &&
        displayedUserIds.has(item.source) &&
        displayedUserIds.has(item.target),
    );
  }, [activeTypes, displayedRelationships, displayedUserIds]);

  const searchConnectionPath = useMemo(
    () =>
      findShortestConnectionPath(
        approvedRelationships,
        activeCurrentUserId,
        searchSelectedUser?.id,
      ),
    [approvedRelationships, activeCurrentUserId, searchSelectedUser?.id],
  );
  const usersById = useMemo(
    () => new Map(visibleDirectoryUsers.map((user) => [user.id, user])),
    [visibleDirectoryUsers],
  );

  const pathNodeIds = useMemo(
    () => new Set<string>(searchConnectionPath?.path ?? []),
    [searchConnectionPath],
  );
  const pathEdgeIds = useMemo(() => {
    const path = searchConnectionPath?.path;
    if (!path || path.length < 2) return new Set<string>();
    const ids = new Set<string>();
    for (let i = 0; i < path.length - 1; i += 1) {
      const a = path[i];
      const b = path[i + 1];
      const rel = approvedRelationships.find(
        (r) =>
          (r.source === a && r.target === b) ||
          (r.source === b && r.target === a),
      );
      if (rel) ids.add(rel.id);
    }
    return ids;
  }, [searchConnectionPath, approvedRelationships]);

  const pathActive = Boolean(hasPro && searchConnectionPath);

  const mappedNodes: Node[] = useMemo(() => {
    const neighborMap = new Map<string, Set<string>>();
    filteredRelationships.forEach((rel) => {
      if (!neighborMap.has(rel.source)) neighborMap.set(rel.source, new Set());
      if (!neighborMap.has(rel.target)) neighborMap.set(rel.target, new Set());
      neighborMap.get(rel.source)?.add(rel.target);
      neighborMap.get(rel.target)?.add(rel.source);
    });

    const positioned = new Set<string>();
    const orderedUsers: User[] = [];

    if (activeCurrentUserId) {
      const currentUser = displayedUsers.find(
        (user) => user.id === activeCurrentUserId,
      );
      if (currentUser) {
        orderedUsers.push(currentUser);
        positioned.add(currentUser.id);
      }
    }

    while (positioned.size < displayedUsers.length) {
      let nextUser: User | null = null;
      let bestConnections = -1;

      for (const user of displayedUsers) {
        if (positioned.has(user.id)) continue;

        const neighbors = neighborMap.get(user.id) ?? new Set();
        const connectedCount = Array.from(neighbors).filter((id) =>
          positioned.has(id),
        ).length;

        if (connectedCount > bestConnections) {
          bestConnections = connectedCount;
          nextUser = user;
        }
      }

      if (!nextUser) {
        nextUser = displayedUsers.find((user) => !positioned.has(user.id)) ?? null;
      }

      if (!nextUser) {
        break;
      }

      orderedUsers.push(nextUser);
      positioned.add(nextUser.id);
    }

    const degreeMap = new Map<string, number>();
    filteredRelationships.forEach((rel) => {
      degreeMap.set(rel.source, (degreeMap.get(rel.source) ?? 0) + 1);
      degreeMap.set(rel.target, (degreeMap.get(rel.target) ?? 0) + 1);
    });

    const items = orderedUsers.map((user, index) => {
      const degree = degreeMap.get(user.id) ?? 0;
      const isPathNode = pathActive && pathNodeIds.has(user.id);
      const isLocked = networkAccess.lockedNodeIds.has(user.id);
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
          profileImage: user.profileImage,
          isPulsing: pulsingNodeIds.includes(user.id),
          isBouncing: bouncingNodeId === user.id,
          isConnected: degree > 0,
          degree,
          isPro: Boolean(user.isPro || user.featured),
          isLocked,
          isPathNode,
          dimmed: pathActive && !isPathNode,
        },
        position: { x: pos.x, y: pos.y },
        style: { background: "transparent", border: "none", padding: 0 },
        draggable: activeCurrentUserId ? user.id === activeCurrentUserId : true,
      } as Node & { position: { x: number; y: number } };
    });

    const connectedPairs = new Set<string>();
    filteredRelationships.forEach((rel) => {
      connectedPairs.add(`${rel.source}|${rel.target}`);
      connectedPairs.add(`${rel.target}|${rel.source}`);
    });

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
    pathActive,
    pathNodeIds,
    networkAccess,
  ]);

  const graphRelationships = useMemo(
    () =>
      filteredRelationships.filter(
        (item) => parseRelationshipNote(item.note).status === "active",
      ),
    [filteredRelationships],
  );

  const mappedEdges: Edge[] = useMemo(() => {
    const nodeById = new Map(mappedNodes.map((node) => [node.id, node]));

    return graphRelationships.map((item) => {
      const sourceNode = nodeById.get(item.source);
      const targetNode = nodeById.get(item.target);
      const sourceX = sourceNode?.position.x ?? 0;
      const targetX = targetNode?.position.x ?? 0;
      const sourceIsLeft = sourceX <= targetX;

      const isPathEdge = pathActive && pathEdgeIds.has(item.id);
      const isDimmedEdge = pathActive && !pathEdgeIds.has(item.id);
      const isLockedEdge =
        networkAccess.lockedNodeIds.has(item.source) ||
        networkAccess.lockedNodeIds.has(item.target);

      const classes: string[] = [];
      if (recentEdgeId === item.id) classes.push("map-edge-reveal");
      if (isPathEdge) classes.push("map-edge-path");

      return {
        id: item.id,
        source: item.source,
        target: item.target,
        className: classes.length ? classes.join(" ") : undefined,
        sourceHandle: sourceIsLeft ? "source-right" : "source-left",
        targetHandle: sourceIsLeft ? "target-left" : "target-right",
        type: "bezier",
        label: item.type,
        animated: false,
        style: {
          stroke: relationColors[item.type] ?? "#94a3b8",
          strokeWidth: isPathEdge ? 3.6 : 2.4,
          strokeOpacity: isLockedEdge ? 0.18 : isDimmedEdge ? 0.18 : isPathEdge ? 1 : 0.8,
          // subtle glow for path edges (SVG filter fallback may vary by renderer)
          filter: isLockedEdge
            ? "blur(3px)"
            : isPathEdge
              ? `drop-shadow(0 6px 10px ${(relationColors[item.type] ?? "#94a3b8") + "66"})`
              : undefined,
        },
        labelStyle: {
          fontSize: 10,
          fill: relationColors[item.type] ?? "#94a3b8",
          fontWeight: 600,
          fontFamily: "system-ui",
          opacity: isLockedEdge ? 0.18 : isDimmedEdge ? 0.25 : 1,
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
  }, [
    graphRelationships,
    mappedNodes,
    networkAccess,
    pathActive,
    pathEdgeIds,
    recentEdgeId,
  ]);

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
      if (parseRelationshipNote(relationship.note).status !== "active") {
        setClientCreatedConnectionCount((count) => count + 1);
      }
      dismissOnboarding();
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
  const selectedIsCurrentUser = Boolean(
    activeCurrentUserId && selectedId === activeCurrentUserId,
  );
  const shouldShowUnlockOverlay = Boolean(
    selectedUser &&
      !hasPro &&
      networkAccess.lockedNodeIds.has(selectedUser.id) &&
      !selectedIsCurrentUser,
  );

  // Compute whether the selected user is directly connected to the active user
  const isDirectlyConnected = useMemo(() => {
    if (!activeCurrentUserId || !selectedId) return false;
    return approvedRelationships.some(
      (r) =>
        (r.source === activeCurrentUserId && r.target === selectedId) ||
        (r.target === activeCurrentUserId && r.source === selectedId),
    );
  }, [approvedRelationships, activeCurrentUserId, selectedId]);

  // Compute degree of separation (shortest path length in number of edges) using BFS
  // Returns null when no path exists or when insufficient inputs
  const selectedDegree = useMemo(() => {
    if (!activeCurrentUserId || !selectedId) return null;
    if (activeCurrentUserId === selectedId) return 0;

    const adj = new Map<string, Set<string>>();
    approvedRelationships.forEach((r) => {
      if (!adj.has(r.source)) adj.set(r.source, new Set());
      if (!adj.has(r.target)) adj.set(r.target, new Set());
      adj.get(r.source)!.add(r.target);
      adj.get(r.target)!.add(r.source);
    });

    const visited = new Set<string>();
    const queue: Array<{ id: string; dist: number }> = [
      { id: activeCurrentUserId, dist: 0 },
    ];
    visited.add(activeCurrentUserId);

    while (queue.length > 0) {
      const { id, dist } = queue.shift()!;
      const neighbors = adj.get(id) ?? new Set();
      for (const n of neighbors) {
        if (visited.has(n)) continue;
        if (n === selectedId) return dist + 1;
        visited.add(n);
        queue.push({ id: n, dist: dist + 1 });
      }
    }

    return null;
  }, [approvedRelationships, activeCurrentUserId, selectedId]);

  // Compute full shortest path (list of user ids from current user -> ... -> selected user)
  // Returns null when no path exists or insufficient inputs
  const selectedPath = useMemo(() => {
    if (!activeCurrentUserId || !selectedId) return null;
    if (activeCurrentUserId === selectedId) return [activeCurrentUserId];

    const adj = new Map<string, Set<string>>();
    approvedRelationships.forEach((r) => {
      if (!adj.has(r.source)) adj.set(r.source, new Set());
      if (!adj.has(r.target)) adj.set(r.target, new Set());
      adj.get(r.source)!.add(r.target);
      adj.get(r.target)!.add(r.source);
    });

    const parent = new Map<string, string | null>();
    const queue: string[] = [];
    queue.push(activeCurrentUserId);
    parent.set(activeCurrentUserId, null);

    while (queue.length > 0) {
      const cur = queue.shift()!;
      const neighbors = adj.get(cur) ?? new Set();
      for (const n of neighbors) {
        if (parent.has(n)) continue;
        parent.set(n, cur);
        if (n === selectedId) {
          // build path
          const path: string[] = [];
          let node: string | null = n;
          while (node) {
            path.push(node);
            node = parent.get(node) ?? null;
          }
          path.reverse();
          return path;
        }
        queue.push(n);
      }
    }

    return null;
  }, [approvedRelationships, activeCurrentUserId, selectedId]);

  // Unlock overlay visibility state for subtle fade+scale animation
  const [unlockOverlayVisible, setUnlockOverlayVisible] = useState(false);

  useEffect(() => {
    if (shouldShowUnlockOverlay) {
      // trigger a micro-tick so CSS transition from 0 -> 100% animates
      setUnlockOverlayVisible(false);
      const t = window.setTimeout(() => setUnlockOverlayVisible(true), 10);
      return () => window.clearTimeout(t);
    }
    setUnlockOverlayVisible(false);
  }, [shouldShowUnlockOverlay]);

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

  function scrollToAddConnection() {
    // Require a signed-in DB user before revealing the private add form.
    if (!activeCurrentUserId) {
      // If the browser session is signed in but the DB record is still syncing,
      // surface a helpful message instead of navigating away.
      if (needsAccountSync) {
        setConnectionError(
          "Finishing your account setup. Please reload in a moment.",
        );
        return;
      }

      // Not signed in: send user to signup flow.
      router.push("/signup");
      return;
    }

    // User is signed in and has a DB record: show the private chart and scroll to the add panel.
    setChartLayer("private");
    setShowSecondaryActions(true);
    if (typeof window !== "undefined") {
      window.setTimeout(() => {
        document
          .getElementById("add-connection-panel")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 80);
    }
  }

  function dismissOnboarding() {
    setIsOnboardingDismissed(true);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("meshy-map-onboarding-dismissed", "true");
    }
  }

  function handlePrivateConnectionAdded() {
    setClientPrivateConnectionCount((count) => count + 1);
    dismissOnboarding();
  }

  return (
    <div className="space-y-8">
      <section className="paper-card rounded-2xl p-4 md:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold leading-tight md:text-4xl">
              Build your network
            </h1>
            <p className="mt-1 text-sm text-black/68 dark:text-white/70">
              Add someone to reveal connections.
            </p>
            <p className="mt-3 text-xs font-semibold text-black/52 dark:text-white/55">
              {personalConnectionCount} connection
              {personalConnectionCount === 1 ? "" : "s"} added
            </p>
          </div>
          <div className="flex sm:justify-end">
            <button
              type="button"
              onClick={scrollToAddConnection}
              className={`rounded-xl bg-[var(--accent)] px-6 py-3 text-base font-bold text-white shadow-lg shadow-black/10 transition hover:brightness-95 ${
                showOnboardingOverlay
                  ? "animate-pulse ring-4 ring-[var(--accent)]/25"
                  : ""
              }`}
            >
              Add person
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-[var(--border-soft)] bg-white/55 p-2 dark:bg-black/20">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex w-full gap-2 rounded-xl bg-black/[0.035] p-1 dark:bg-white/[0.06] sm:w-auto">
            <button
              type="button"
              onClick={() => setChartLayer("private")}
              className={`min-h-10 flex-1 rounded-lg px-5 py-2 text-sm font-bold transition sm:min-w-32 sm:flex-none ${
                chartLayer === "private"
                  ? "bg-[var(--accent)] text-white"
                  : "text-black/72 hover:bg-black/5 dark:text-white/72 dark:hover:bg-white/10"
              }`}
            >
              Private
            </button>
            <button
              type="button"
              onClick={() => setChartLayer("public")}
              className={`min-h-10 flex-1 rounded-lg px-5 py-2 text-sm font-bold transition sm:min-w-32 sm:flex-none ${
                chartLayer === "public"
                  ? "bg-[var(--accent)] text-white"
                  : "text-black/72 hover:bg-black/5 dark:text-white/72 dark:hover:bg-white/10"
              }`}
            >
              Public
            </button>
          </div>
        </div>
      </section>

      {chartLayer === "private" && activeCurrentUserId ? (
        <PrivateChart
          initialPlaceholders={privatePlaceholders}
          baseUrl={baseUrl}
          currentUserId={activeCurrentUserId}
          approvedConnections={approvedUserConnections}
          users={visibleDirectoryUsers}
          onPrivateConnectionAdded={handlePrivateConnectionAdded}
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
              : "Sign in to add people"}
          </p>
          <p className="mt-1 text-xs text-white/60">
            {needsAccountSync
              ? "Syncing your profile now."
              : "Create an account to save connections."}
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
        <div
          className={`grid gap-4 ${
            showSecondaryActions ? "lg:grid-cols-[1.5fr_0.9fr]" : ""
          }`}
        >
          <section className="paper-card rounded-2xl p-4">
            <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-2xl font-semibold">Network graph</h2>
              </div>
              <button
                type="button"
                onClick={() => setShowSecondaryActions((shown) => !shown)}
                className="rounded-full border border-[var(--border-soft)] px-3 py-1.5 text-xs font-semibold transition hover:bg-black/5 dark:hover:bg-white/10"
              >
                {showSecondaryActions
                  ? "Hide tools"
                  : "Show search and filters"}
              </button>
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
              className="relative h-[620px] overflow-hidden rounded-2xl border border-[var(--border-soft)]"
              style={{ background: "#0f0819" }}
            >
              <div className="pointer-events-none absolute inset-0 z-0">
                <span className="map-bg-dot map-bg-dot-1" aria-hidden="true" />
                <span className="map-bg-dot map-bg-dot-2" aria-hidden="true" />
                <span className="map-bg-dot map-bg-dot-3" aria-hidden="true" />
                <span className="map-bg-dot map-bg-dot-4" aria-hidden="true" />
              </div>
              {showOnboardingOverlay ? (
                <div className="absolute left-4 top-4 z-20 max-w-[260px] rounded-xl border border-white/15 bg-black/70 p-4 text-white shadow-xl shadow-black/20 backdrop-blur">
                  <p className="text-sm font-bold">Add person</p>
                  <p className="mt-1 text-xs leading-5 text-white/72">
                    Start with one connection.
                  </p>
                  <button
                    type="button"
                    onClick={dismissOnboarding}
                    className="mt-3 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-[#0f0819] transition hover:bg-white/90"
                  >
                    Got it
                  </button>
                </div>
              ) : null}
              <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                fitView={chartLayer === "public"}
                onNodeClick={(_, node) => {
                  setSelectedId(node.id);
                }}
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

              {/* Unlock overlay for network nodes beyond the free exploration limit */}
              {shouldShowUnlockOverlay ? (
                <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-auto">
                  {/* Dark backdrop */}
                  <div className="absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity duration-200" />

                  {/* If we're showing a teaser for a non-direct connection, do NOT reveal any path info.
                      Hide the blurred preview and only surface a small teaser showing degree of separation. */}
                  {selectedUser &&
                  activeCurrentUserId &&
                  !isDirectlyConnected ? (
                    // CONNECTION PATH TEASER (no path details revealed for non-Pro users)
                    <>
                      {/* Centered modal with fade+scale */}
                      <div
                        className={`relative z-40 w-full max-w-md rounded-2xl bg-[#0f0819]/95 border border-white/8 p-6 text-white shadow-2xl transform transition-all duration-180 ease-out ${
                          unlockOverlayVisible
                            ? "opacity-100 scale-100"
                            : "opacity-0 scale-95"
                        }`}
                        role="dialog"
                        aria-modal="true"
                      >
                        <p className="text-lg font-semibold truncate">
                          {selectedDegree !== null
                            ? `This node is ${selectedDegree} connection${selectedDegree === 1 ? "" : "s"} away`
                            : "This part of the chart is locked"}
                        </p>

                        <p className="mt-2 text-sm text-white/70">
                          Free accounts can explore 15 second-degree nodes. Pro unlocks the rest.
                        </p>

                        <div className="mt-5 flex gap-3">
                          <button
                            type="button"
                            onClick={() => router.push("/checkout")}
                            className="flex-1 rounded-lg bg-[#ff7b6b] py-3 text-sm font-semibold text-white shadow-lg transition transform hover:-translate-y-0.5 hover:shadow-[0_12px_30px_rgba(255,123,107,0.18)] focus:outline-none focus:ring-4 focus:ring-[#ff7b6b]/30"
                          >
                            Unlock the path with Pro
                          </button>

                          <button
                            type="button"
                            onClick={() => setSelectedId(null)}
                            className="rounded-lg px-4 py-3 text-sm font-normal text-white/40 hover:text-white/50"
                          >
                            Not now
                          </button>
                        </div>
                      </div>
                    </>
                  ) : (
                    // FALLBACK: keep the existing blurred preview + modal for other cases
                    <>
                      {/* Blurred preview of hidden info (behind modal) */}
                      <div className="absolute z-35 w-full max-w-md -translate-y-20 rounded-xl p-4 text-sm text-white/80">
                        <div className="rounded-lg bg-white/6 p-3 text-white/60 filter blur-sm">
                          <p className="mb-2 text-xs font-semibold">Preview</p>
                          <div className="space-y-1">
                            {selectedConnections.slice(0, 4).map((c) => {
                              return (
                                <div
                                  key={c.id}
                                  className="flex items-center gap-2"
                                >
                                  <span className="h-2.5 w-2.5 rounded-full bg-white/60" />
                                  <span className="truncate text-xs"></span>
                                  <span className="ml-auto text-[11px] text-white/40"></span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>

                      {/* Centered modal with fade+scale */}
                      <div
                        className={`relative z-40 w-full max-w-md rounded-2xl bg-[#0f0819]/95 border border-white/8 p-6 text-white shadow-2xl transform transition-all duration-180 ease-out ${
                          unlockOverlayVisible
                            ? "opacity-100 scale-100"
                            : "opacity-0 scale-95"
                        }`}
                        role="dialog"
                        aria-modal="true"
                      >
                        <p className="text-lg font-semibold truncate">
                          Unlock the rest of your chart
                        </p>

                        <ul className="mt-2 space-y-1 text-sm text-white/70">
                          <li>• Nodes beyond the first 15</li>
                          <li>• Full connection paths</li>
                          <li>• Relationship context</li>
                        </ul>

                        <div className="mt-5 flex gap-3">
                          <button
                            type="button"
                            onClick={() => router.push("/checkout")}
                            className="flex-1 rounded-lg bg-[#ff7b6b] py-3 text-sm font-semibold text-white shadow-lg transition transform hover:-translate-y-0.5 hover:shadow-[0_12px_30px_rgba(255,123,107,0.18)] focus:outline-none focus:ring-4 focus:ring-[#ff7b6b]/30"
                          >
                            Unlock the path with Pro
                          </button>

                          <button
                            type="button"
                            onClick={() => setSelectedId(null)}
                            // Reduced visual emphasis: lighter text and normal weight
                            className="rounded-lg px-4 py-3 text-sm font-normal text-white/40 hover:text-white/50"
                          >
                            Not now
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              ) : null}
            </div>

            {selectedUser && !shouldShowUnlockOverlay ? (
              <div className="mt-4 rounded-xl border border-[var(--border-soft)] bg-black/[0.025] p-4 dark:bg-white/[0.04]">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar
                      name={selectedUser.name}
                      src={selectedUser.profileImage ?? undefined}
                      className="h-11 w-11"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold">
                        {selectedUser.name}
                      </p>
                      <p className="truncate text-xs text-black/58 dark:text-white/58">
                        @{selectedUser.handle}
                        {selectedUser.location
                          ? ` · ${selectedUser.location}`
                          : ""}
                      </p>
                      {selectedDegree !== null ? (
                        <p className="mt-1 text-xs font-medium text-black/65 dark:text-white/65">
                          {selectedDegree === 0
                            ? "This is you."
                            : `${selectedDegree} connection${selectedDegree === 1 ? "" : "s"} away.`}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {!selectedIsCurrentUser ? (
                      <button
                        type="button"
                        onClick={() =>
                          reportNode(selectedUser.id, selectedUser.name)
                        }
                        disabled={reportingUserId === selectedUser.id}
                        className="rounded-full border border-red-500/30 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-500/10 disabled:opacity-60 dark:text-red-300"
                      >
                        {reportingUserId === selectedUser.id
                          ? "Reporting..."
                          : "Report"}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setSelectedId(null)}
                      className="rounded-full border border-[var(--border-soft)] px-3 py-1.5 text-xs font-semibold transition hover:bg-black/5 dark:hover:bg-white/10"
                    >
                      Close
                    </button>
                  </div>
                </div>

                <div className="mt-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-black/55 dark:text-white/55">
                    Visible verified connections
                  </p>
                  {selectedConnections.length === 0 ? (
                    <p className="mt-2 text-xs text-black/62 dark:text-white/64">
                      No visible verified connections for this node with the
                      current filters.
                    </p>
                  ) : (
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      {selectedConnections.map((connection) => {
                        const otherUserId =
                          connection.source === selectedUser.id
                            ? connection.target
                            : connection.source;
                        const otherUser = usersById.get(otherUserId);
                        const color =
                          relationColors[connection.type] ?? "#94a3b8";

                        return (
                          <div
                            key={`selected-${connection.id}`}
                            className="flex items-center gap-2 rounded-lg border border-[var(--border-soft)] bg-white/50 px-3 py-2 text-xs dark:bg-black/20"
                          >
                            <span
                              className="h-2.5 w-2.5 shrink-0 rounded-full"
                              style={{ backgroundColor: color }}
                            />
                            <span className="min-w-0 flex-1 truncate font-semibold">
                              {otherUser?.name ?? "Member"}
                            </span>
                            <span
                              className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                              style={{
                                backgroundColor: `${color}22`,
                                color,
                                border: `1px solid ${color}44`,
                              }}
                            >
                              {connection.type}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            {activeCurrentUserId ? (
              <details
                id="pending-verification"
                className="mt-4 rounded-xl border border-[var(--border-soft)] p-3"
              >
                <summary className="cursor-pointer text-sm font-semibold uppercase tracking-wide">
                  Pending Verification
                  {pendingRequests.length > 0
                    ? ` (${pendingRequests.length})`
                    : ""}
                </summary>
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
                                  Verify - this is me
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
                                  Yes, that&apos;s them - make public
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
              </details>
            ) : null}
          </section>
          {showSecondaryActions ? (
            <aside className="paper-card rounded-2xl p-4 lg:sticky lg:top-4 lg:self-start">
              <div className="mb-4">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--accent)]">
                  Tools
                </p>
                <h3 className="mt-1 text-xl font-semibold">
                  Search and filters
                </h3>
              </div>
              <div className="space-y-3">
                <form
                  className="flex flex-col gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    searchLoadedUsers();
                  }}
                >
                  <input
                    type="search"
                    aria-label="Search for a user"
                    placeholder="Search for a user"
                    value={searchValue}
                    onChange={(event) => {
                      setSearchValue(event.target.value);
                      setHasSearchedUsers(false);
                      setSearchResults([]);
                      setSearchSelectedUser(null);
                    }}
                    className="min-h-10 rounded-xl border border-[var(--border-soft)] bg-white/75 px-3 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-65 dark:bg-white/[0.06]"
                  />
                  <button
                    type="submit"
                    disabled={!searchValue.trim()}
                    className="min-h-10 rounded-xl border border-[var(--border-soft)] px-4 text-sm font-semibold text-black/55 disabled:cursor-not-allowed disabled:opacity-65 dark:text-white/60"
                  >
                    Search
                  </button>
                </form>
                <p
                  className="text-xs text-black/58 dark:text-white/58"
                  aria-live="polite"
                >
                  {!hasSearchedUsers
                    ? searchValue.trim()
                      ? "Press Search to look for a matching user."
                      : "Search for a user to see how many connections away they are."
                    : searchResults.length > 0
                      ? `${searchResults.length} matching user${searchResults.length === 1 ? "" : "s"} found.`
                      : "No matching user found."}
                </p>
                {searchSelectedUser ? (
                  <div className="flex items-center gap-3 rounded-xl border border-[var(--border-soft)] bg-black/[0.025] p-3 dark:bg-white/[0.05]">
                    <Avatar
                      name={searchSelectedUser.name}
                      src={searchSelectedUser.profileImage ?? undefined}
                      className="h-10 w-10"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">
                        {searchSelectedUser.name}
                      </p>
                      <p className="truncate text-xs text-black/58 dark:text-white/58">
                        @{searchSelectedUser.handle}
                      </p>
                      <p className="mt-1 text-xs font-medium text-black/65 dark:text-white/65">
                        {searchConnectionPath
                          ? searchConnectionPath.degree === 0
                            ? "This is you."
                            : `${searchConnectionPath.degree} connection${searchConnectionPath.degree === 1 ? "" : "s"} away.`
                          : "No connection path found."}
                      </p>
                      {searchConnectionPath && hasPro ? (
                        <ol className="mt-2 flex flex-wrap gap-1 text-xs text-black/65 dark:text-white/65">
                          {searchConnectionPath.path.map((userId, index) => {
                            const pathUser = usersById.get(userId);
                            return (
                              <li
                                key={userId}
                                className="flex items-center gap-1"
                              >
                                {index > 0 ? (
                                  <span className="text-black/35 dark:text-white/35">
                                    /
                                  </span>
                                ) : null}
                                <span>{pathUser?.name ?? "Member"}</span>
                              </li>
                            );
                          })}
                        </ol>
                      ) : searchConnectionPath ? (
                        <p className="mt-2 text-xs text-black/55 dark:text-white/55">
                          Full path is available with Pro.
                        </p>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-2">
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
              </div>
            </aside>
          ) : null}
        </div>
      ) : null}
      {afterGraph ? <div>{afterGraph}</div> : null}
      <section className="flex flex-wrap items-center gap-2 text-xs text-black/58 dark:text-white/58">
        <span className="rounded-full border border-[var(--border-soft)] px-3 py-1">
          🔒 Private — only you
        </span>
        <span className="rounded-full border border-[var(--border-soft)] px-3 py-1">
          🌍 Public — verified
        </span>
        <span
          className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[var(--border-soft)]"
          title="Private connections stay on your chart. Public connections are visible after verification."
          aria-label="Private and public connection details"
        >
          <Info className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
      </section>
    </div>
  );
}
