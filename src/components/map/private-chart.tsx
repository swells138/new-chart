"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import type {
  PrivateConfirmedConnectionEdge,
  PrivateConnectionEdge,
  PrivateMixedConnectionEdge,
  PlaceholderPerson,
  Relationship,
  RelationshipType,
  User,
} from "@/types/models";
import type { PrivateDuplicateMatch } from "@/lib/private-duplicate-matches";
import { chooseExistingPrivatePerson } from "@/lib/private-duplicate-flow";
import { SmsConsentCheckbox } from "@/components/ui/sms-consent-checkbox";

const ALL_TYPES: RelationshipType[] = [
  "Talking",
  "Dating",
  "Situationship",
  "Exes",
  "Married",
  "Sneaky Link",
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
  Lovers: "#ee82d8",
  "One Night Stand": "#ffbb6f",
  complicated: "#7aa2ff",
  FWB: "#63b1ff",
};

const STATUS_LABELS: Record<PlaceholderPerson["claimStatus"], string> = {
  unclaimed: "Waiting for signup",
  invited: "Invite link ready",
  claimed: "Moved to verification",
  denied: "Declined",
};

const CHART_CENTER_X = 440;
const CHART_CENTER_Y = 220;

function hashNumber(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i += 1) {
    h = (h * 33 + input.charCodeAt(i)) & 0xffffffff;
  }
  return Math.abs(h);
}

function getOrganicChartPosition(
  id: string,
  kind: "private" | "public",
  index: number,
  total: number,
) {
  const seed = hashNumber(id);
  const safeTotal = Math.max(total, 1);
  const baseAngle = (index / safeTotal) * Math.PI * 2;
  const angleJitter = ((seed % 1000) / 1000) * 0.72 - 0.36;
  const angle = baseAngle - Math.PI / 2 + angleJitter;

  const radiusBase = kind === "public" ? 190 : 145;
  const radiusJitter = (seed % 46) - 23;
  const radius = radiusBase + radiusJitter;
  const yScale = kind === "public" ? 0.84 : 0.7;

  const x = Math.max(
    72,
    Math.min(808, CHART_CENTER_X + Math.cos(angle) * radius),
  );
  const y = Math.max(
    56,
    Math.min(392, CHART_CENTER_Y + Math.sin(angle) * radius * yScale),
  );

  return { x, y };
}

function getCurvedPath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  curvature: number,
  seed: number,
) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const distance = Math.max(Math.hypot(dx, dy), 1);
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;

  const normalX = -dy / distance;
  const normalY = dx / distance;
  const direction = seed % 2 === 0 ? 1 : -1;
  const bend = distance * curvature * direction;

  const controlX = midX + normalX * bend;
  const controlY = midY + normalY * bend;

  return `M ${x1} ${y1} Q ${controlX} ${controlY} ${x2} ${y2}`;
}

interface Props {
  initialPlaceholders: PlaceholderPerson[];
  baseUrl: string;
  currentUserId: string | null;
  approvedConnections?: Relationship[];
  users?: User[];
  onPrivateConnectionAdded?: () => void;
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

type WorkflowTab = "add" | "connect" | "pending";

export function PrivateChart({
  initialPlaceholders,
  baseUrl,
  currentUserId,
  approvedConnections = [],
  users = [],
  onPrivateConnectionAdded,
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

  const authFetch = useCallback(
    async (input: string, init?: RequestInit) => {
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
    },
    [getToken],
  );

  const currentUserName = useMemo(() => {
    if (!currentUserId) return "You";
    return users.find((user) => user.id === currentUserId)?.name || "You";
  }, [users, currentUserId]);

  const currentUserProfileImage = useMemo(() => {
    if (!currentUserId) return null;
    return (
      users.find((user) => user.id === currentUserId)?.profileImage ?? null
    );
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

  const chartLayout = useMemo(
    () =>
      chartConnections.map((item, index) => {
        const { x, y } = getOrganicChartPosition(
          item.id,
          item.kind,
          index,
          chartConnections.length,
        );
        return { ...item, x, y };
      }),
    [chartConnections],
  );

  const [privateWebEdges, setPrivateWebEdges] = useState<
    PrivateConnectionEdge[]
  >([]);
  const [webRelationshipType, setWebRelationshipType] =
    useState<RelationshipType>("Talking");
  const [webNote, setWebNote] = useState("");
  const [confirmedWebEdges, setConfirmedWebEdges] = useState<
    PrivateConfirmedConnectionEdge[]
  >([]);
  const [mixedWebEdges, setMixedWebEdges] = useState<
    PrivateMixedConnectionEdge[]
  >([]);
  const [sourceNodeKey, setSourceNodeKey] = useState("");
  const [targetNodeKey, setTargetNodeKey] = useState("");
  const [isSavingAnyWebEdge, setIsSavingAnyWebEdge] = useState(false);
  const [deletingAnyWebEdgeId, setDeletingAnyWebEdgeId] = useState<
    string | null
  >(null);

  const confirmedDirectNodes = useMemo(() => {
    const usersById = new Map(users.map((u) => [u.id, u]));
    const seen = new Set<string>();
    return approvedConnections
      .map((rel) => {
        const otherId = rel.source === currentUserId ? rel.target : rel.source;
        if (!otherId || seen.has(otherId)) {
          return null;
        }
        seen.add(otherId);
        const other = usersById.get(otherId);
        if (!other) {
          return null;
        }
        return { id: otherId, name: other.name };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
  }, [approvedConnections, users, currentUserId]);

  const chartPositionById = useMemo(() => {
    return new Map(chartLayout.map((item) => [item.id, item]));
  }, [chartLayout]);

  const visiblePrivateWebEdges = useMemo(
    () =>
      privateWebEdges.filter(
        (edge) =>
          chartPositionById.has(`private-${edge.sourcePlaceholderId}`) &&
          chartPositionById.has(`private-${edge.targetPlaceholderId}`),
      ),
    [privateWebEdges, chartPositionById],
  );

  const visibleConfirmedWebEdges = useMemo(
    () =>
      confirmedWebEdges.filter(
        (edge) =>
          chartPositionById.has(`public-${edge.sourceUserId}`) &&
          chartPositionById.has(`public-${edge.targetUserId}`),
      ),
    [confirmedWebEdges, chartPositionById],
  );

  const visibleMixedWebEdges = useMemo(
    () =>
      mixedWebEdges.filter(
        (edge) =>
          chartPositionById.has(`private-${edge.placeholderId}`) &&
          chartPositionById.has(`public-${edge.userId}`),
      ),
    [mixedWebEdges, chartPositionById],
  );

  const discoveredConnections =
    chartConnections.length +
    privateWebEdges.length +
    confirmedWebEdges.length +
    mixedWebEdges.length;

  const webNodeOptions = useMemo(
    () => [
      ...placeholders.map((p) => ({
        key: `p:${p.id}`,
        name: p.name,
        kindLabel: "Private",
      })),
      ...confirmedDirectNodes.map((node) => ({
        key: `u:${node.id}`,
        name: node.name,
        kindLabel: "Confirmed",
      })),
    ],
    [placeholders, confirmedDirectNodes],
  );

  const combinedWebEdges = useMemo(
    () => [
      ...privateWebEdges.map((edge) => ({
        edgeKind: "placeholder" as const,
        id: edge.id,
        sourceName:
          placeholders.find((p) => p.id === edge.sourcePlaceholderId)?.name ??
          "Unknown",
        targetName:
          placeholders.find((p) => p.id === edge.targetPlaceholderId)?.name ??
          "Unknown",
        relationshipType: edge.relationshipType,
        note: edge.note,
      })),
      ...confirmedWebEdges.map((edge) => ({
        edgeKind: "confirmed" as const,
        id: edge.id,
        sourceName:
          confirmedDirectNodes.find((node) => node.id === edge.sourceUserId)
            ?.name ?? "Unknown",
        targetName:
          confirmedDirectNodes.find((node) => node.id === edge.targetUserId)
            ?.name ?? "Unknown",
        relationshipType: edge.relationshipType,
        note: edge.note,
      })),
      ...mixedWebEdges.map((edge) => ({
        edgeKind: "mixed" as const,
        id: edge.id,
        sourceName:
          placeholders.find((p) => p.id === edge.placeholderId)?.name ??
          "Unknown",
        targetName:
          confirmedDirectNodes.find((node) => node.id === edge.userId)?.name ??
          "Unknown",
        relationshipType: edge.relationshipType,
        note: edge.note,
      })),
    ],
    [
      privateWebEdges,
      confirmedWebEdges,
      mixedWebEdges,
      placeholders,
      confirmedDirectNodes,
    ],
  );

  // Add-form state
  const [addName, setAddName] = useState("");
  const [addOfferToNameMatch, setAddOfferToNameMatch] = useState(true);
  const [addEmail, setAddEmail] = useState("");
  const [addPhoneNumber, setAddPhoneNumber] = useState("");
  const [addType, setAddType] = useState<RelationshipType>("Talking");
  const [addNote, setAddNote] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [addHint, setAddHint] = useState<string | null>(null);
  const [addSuccessMessage, setAddSuccessMessage] = useState<string | null>(
    null,
  );
  const [duplicateMatches, setDuplicateMatches] = useState<
    PrivateDuplicateMatch[]
  >([]);
  const [duplicateCheckError, setDuplicateCheckError] = useState<string | null>(
    null,
  );
  const [duplicateEmptyMessage, setDuplicateEmptyMessage] = useState<
    string | null
  >(null);
  const [existingUserSuggestion, setExistingUserSuggestion] =
    useState<ExistingUserSuggestion | null>(null);
  const [activeWorkflowTab, setActiveWorkflowTab] =
    useState<WorkflowTab>("pending");
  const [publicConnectCandidates, setPublicConnectCandidates] = useState<
    Record<string, PublicConnectCandidate>
  >({});
  const [publicConnectingPlaceholderId, setPublicConnectingPlaceholderId] =
    useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [isCheckingDuplicates, setIsCheckingDuplicates] = useState(false);

  // SMS consent state for sending phone invites
  const [smsConsentByPlaceholderId, setSmsConsentByPlaceholderId] = useState<
    Record<string, boolean>
  >({});

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
  const [editOfferToNameMatch, setEditOfferToNameMatch] = useState(false);
  const [editEmail, setEditEmail] = useState("");
  const [editPhoneNumber, setEditPhoneNumber] = useState("");
  const [editType, setEditType] = useState<RelationshipType>("Talking");
  const [editNote, setEditNote] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Invite/action state
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [reportingId, setReportingId] = useState<string | null>(null);

  useEffect(() => {
    if (!currentUserId) {
      setPrivateWebEdges([]);
      setConfirmedWebEdges([]);
      setMixedWebEdges([]);
      return;
    }

    let cancelled = false;

    async function loadPrivateWebEdges() {
      try {
        const res = await authFetch("/api/private-connections/web", {
          method: "GET",
        });
        const body = (await res.json()) as {
          edges?: PrivateConnectionEdge[];
          error?: string;
        };
        if (!res.ok) {
          if (!cancelled) {
            setActionError(
              body.error ?? "Could not load your private web connections.",
            );
          }
          return;
        }

        if (!cancelled) {
          setPrivateWebEdges(body.edges ?? []);
        }
      } catch {
        if (!cancelled) {
          setActionError("Could not load your private web connections.");
        }
      }
    }

    async function loadConfirmedWebEdges() {
      try {
        const res = await authFetch("/api/private-connections/web-confirmed", {
          method: "GET",
        });
        const body = (await res.json()) as {
          edges?: PrivateConfirmedConnectionEdge[];
          error?: string;
        };
        if (!res.ok) {
          if (!cancelled) {
            setActionError(
              body.error ?? "Could not load private confirmed web connections.",
            );
          }
          return;
        }

        if (!cancelled) {
          setConfirmedWebEdges(body.edges ?? []);
        }
      } catch {
        if (!cancelled) {
          setActionError("Could not load private confirmed web connections.");
        }
      }
    }

    async function loadMixedWebEdges() {
      try {
        const res = await authFetch("/api/private-connections/web-mixed", {
          method: "GET",
        });
        const body = (await res.json()) as {
          edges?: PrivateMixedConnectionEdge[];
          error?: string;
        };
        if (!res.ok) {
          if (!cancelled) {
            setActionError(
              body.error ?? "Could not load private mixed web connections.",
            );
          }
          return;
        }

        if (!cancelled) {
          setMixedWebEdges(body.edges ?? []);
        }
      } catch {
        if (!cancelled) {
          setActionError("Could not load private mixed web connections.");
        }
      }
    }

    void loadPrivateWebEdges();
    void loadConfirmedWebEdges();
    void loadMixedWebEdges();

    return () => {
      cancelled = true;
    };
  }, [authFetch, currentUserId]);

  useEffect(() => {
    if (webNodeOptions.length === 0) {
      setSourceNodeKey("");
      setTargetNodeKey("");
      return;
    }

    if (
      !sourceNodeKey ||
      !webNodeOptions.some((node) => node.key === sourceNodeKey)
    ) {
      setSourceNodeKey(webNodeOptions[0]?.key ?? "");
    }

    if (
      !targetNodeKey ||
      !webNodeOptions.some((node) => node.key === targetNodeKey)
    ) {
      const fallback = webNodeOptions.find(
        (node) => node.key !== (sourceNodeKey || webNodeOptions[0]?.key),
      );
      setTargetNodeKey(fallback?.key ?? "");
    }
  }, [webNodeOptions, sourceNodeKey, targetNodeKey]);

  async function handleCreateAnyWebEdge(e: React.FormEvent) {
    e.preventDefault();

    if (!sourceNodeKey || !targetNodeKey) {
      setActionError("Pick two nodes to link.");
      return;
    }

    if (sourceNodeKey === targetNodeKey) {
      setActionError("Pick two different nodes.");
      return;
    }

    const [sourceKind, sourceId] = sourceNodeKey.split(":", 2);
    const [targetKind, targetId] = targetNodeKey.split(":", 2);

    if (!sourceKind || !sourceId || !targetKind || !targetId) {
      setActionError("Invalid node selection.");
      return;
    }

    setIsSavingAnyWebEdge(true);
    setActionError(null);
    setActionMessage(null);

    try {
      if (sourceKind === "p" && targetKind === "p") {
        const res = await authFetch("/api/private-connections/web", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sourcePlaceholderId: sourceId,
            targetPlaceholderId: targetId,
            relationshipType: webRelationshipType,
            note: webNote.trim() || undefined,
          }),
        });

        const body = (await res.json()) as {
          edge?: PrivateConnectionEdge;
          error?: string;
        };

        if (!res.ok || !body.edge) {
          setActionError(body.error ?? "Could not create this private link.");
          return;
        }

        setPrivateWebEdges((prev) => {
          const withoutSameId = prev.filter(
            (item) => item.id !== body.edge!.id,
          );
          return [body.edge!, ...withoutSameId];
        });
        setWebNote("");
        setActionMessage("Private link created.");
      } else if (sourceKind === "u" && targetKind === "u") {
        const res = await authFetch("/api/private-connections/web-confirmed", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sourceUserId: sourceId,
            targetUserId: targetId,
            relationshipType: webRelationshipType,
            note: webNote.trim() || undefined,
          }),
        });

        const body = (await res.json()) as {
          edge?: PrivateConfirmedConnectionEdge;
          error?: string;
        };

        if (!res.ok || !body.edge) {
          setActionError(
            body.error ?? "Could not create this private confirmed link.",
          );
          return;
        }

        setConfirmedWebEdges((prev) => {
          const withoutSameId = prev.filter(
            (item) => item.id !== body.edge!.id,
          );
          return [body.edge!, ...withoutSameId];
        });
        setWebNote("");
        setActionMessage("Private confirmed link created.");
      } else {
        const placeholderId = sourceKind === "p" ? sourceId : targetId;
        const userId = sourceKind === "u" ? sourceId : targetId;

        const res = await authFetch("/api/private-connections/web-mixed", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            placeholderId,
            userId,
            relationshipType: webRelationshipType,
            note: webNote.trim() || undefined,
          }),
        });

        const body = (await res.json()) as {
          edge?: PrivateMixedConnectionEdge;
          error?: string;
        };

        if (!res.ok || !body.edge) {
          setActionError(body.error ?? "Could not create this mixed link.");
          return;
        }

        setMixedWebEdges((prev) => {
          const withoutSameId = prev.filter(
            (item) => item.id !== body.edge!.id,
          );
          return [body.edge!, ...withoutSameId];
        });
        setWebNote("");
        setActionMessage("Private mixed link created.");
      }
    } catch {
      setActionError("Could not create this private link.");
    } finally {
      setIsSavingAnyWebEdge(false);
    }
  }

  async function handleDeleteAnyWebEdge(
    edge: (typeof combinedWebEdges)[number],
  ) {
    setDeletingAnyWebEdgeId(edge.id);
    setActionError(null);
    setActionMessage(null);
    try {
      const endpoint =
        edge.edgeKind === "placeholder"
          ? "/api/private-connections/web"
          : edge.edgeKind === "confirmed"
            ? "/api/private-connections/web-confirmed"
            : "/api/private-connections/web-mixed";

      const res = await authFetch(endpoint, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: edge.id }),
      });

      const body = (await res.json()) as {
        deleted?: boolean;
        error?: string;
      };

      if (!res.ok || !body.deleted) {
        setActionError(body.error ?? "Could not remove that private link.");
        return;
      }

      if (edge.edgeKind === "placeholder") {
        setPrivateWebEdges((prev) =>
          prev.filter((item) => item.id !== edge.id),
        );
      } else if (edge.edgeKind === "confirmed") {
        setConfirmedWebEdges((prev) =>
          prev.filter((item) => item.id !== edge.id),
        );
      } else {
        setMixedWebEdges((prev) => prev.filter((item) => item.id !== edge.id));
      }

      setActionMessage("Private link removed.");
    } catch {
      setActionError("Could not remove that private link.");
    } finally {
      setDeletingAnyWebEdgeId(null);
    }
  }

  function clearDuplicateCheckState() {
    setDuplicateMatches([]);
    setDuplicateCheckError(null);
    setDuplicateEmptyMessage(null);
    setExistingUserSuggestion(null);
  }

  function getAddPayload(name: string) {
    return {
      name,
      offerToNameMatch: addOfferToNameMatch,
      email: addEmail.trim() || undefined,
      phoneNumber: addPhoneNumber.trim() || undefined,
      relationshipType: addType,
      note: addNote.trim() || undefined,
    };
  }

  async function createPrivateConnection(skipDuplicateCheck: boolean) {
    const name = addName.trim();
    if (!name) {
      setAddError("A name is required.");
      return;
    }

    if (!skipDuplicateCheck) {
      setIsCheckingDuplicates(true);
      setAddError(null);
      setAddHint(null);
      setAddSuccessMessage(null);
      clearDuplicateCheckState();

      try {
        const res = await authFetch("/api/private-connections/similar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            email: addEmail.trim() || undefined,
            phoneNumber: addPhoneNumber.trim() || undefined,
          }),
        });
        const body = (await res.json()) as {
          matches?: PrivateDuplicateMatch[];
          suggestion?: ExistingUserSuggestion | null;
          error?: string;
        };

        if (!res.ok) {
          setDuplicateCheckError(
            body.error ??
              "Could not check for similar people. You can still create a new private person.",
          );
          return;
        }

        if (body.suggestion) {
          setExistingUserSuggestion(body.suggestion);
        }

        if (body.matches && body.matches.length > 0) {
          setDuplicateMatches(body.matches);
          return;
        }

        if (body.suggestion) {
          return;
        }

        setDuplicateEmptyMessage("No similar private people found.");
      } catch {
        setDuplicateCheckError(
          "Could not check for similar people. You can still create a new private person.",
        );
        return;
      } finally {
        setIsCheckingDuplicates(false);
      }
    }

    setIsAdding(true);
    setAddError(null);
    if (skipDuplicateCheck) {
      setAddHint(null);
    }
    setAddSuccessMessage(null);
    setDuplicateMatches([]);
    setDuplicateCheckError(null);
    setExistingUserSuggestion(null);
    if (skipDuplicateCheck) {
      setDuplicateEmptyMessage(null);
    }

    try {
      const res = await authFetch("/api/private-connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(getAddPayload(name)),
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
      onPrivateConnectionAdded?.();
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
      setAddOfferToNameMatch(true);
      setAddEmail("");
      setAddPhoneNumber("");
      setAddNote("");
      setAddSuccessMessage(
        skipDuplicateCheck
          ? "Added a new private person. This stays private until they join and claim their node. Generate an invite link and share it with them when you're ready."
          : "Added privately. This stays private until they join and claim their node. Generate an invite link and share it with them when you're ready.",
      );
    } catch {
      setAddError("Could not add that connection right now.");
    } finally {
      setIsAdding(false);
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    await createPrivateConnection(false);
  }

  function handleUseExistingPerson(match: PrivateDuplicateMatch) {
    const choice = chooseExistingPrivatePerson(match);
    clearDuplicateCheckState();
    setAddError(null);
    setAddHint(null);
    setAddName("");
    setAddOfferToNameMatch(true);
    setAddEmail("");
    setAddPhoneNumber("");
    setAddNote("");
    setAddSuccessMessage(choice.message);
    highlightConnection(`private-${choice.existingPersonId}`);
  }

  async function handleGenerateInvite(id: string) {
    setWorkingId(id);
    setActionError(null);
    setActionMessage(null);

    const placeholder = placeholders.find((p) => p.id === id) ?? null;
    const hasPhone = Boolean((placeholder?.phoneNumber ?? "").trim());
    const smsConsentProvided = Boolean(smsConsentByPlaceholderId[id]);

    try {
      const res = await authFetch("/api/private-connections", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          action: "generateInvite",
          smsConsent: hasPhone ? smsConsentProvided : undefined,
          consentSource: hasPhone ? "private-chart-card" : undefined,
        }),
      });
      const body = (await res.json()) as {
        placeholder?: PlaceholderPerson;
        error?: string;
      };
      if (!res.ok || !body.placeholder) {
        setActionError(body.error ?? "Could not generate invite link.");
        return;
      }
      setPlaceholders((prev) =>
        prev.map((p) => (p.id === id ? body.placeholder! : p)),
      );
      setActionMessage("Invite link generated.");
    } catch {
      setActionError("Could not generate invite link.");
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
      // Read raw response text so debugging always surfaces the server body.
      let parsed:
        | { deleted?: boolean; id?: string; error?: string }
        | undefined;
      try {
        const text = await res.text();
        try {
          parsed = JSON.parse(text) as {
            deleted?: boolean;
            id?: string;
            error?: string;
          };
        } catch {
          // If response isn't JSON, keep the raw text in the error field.
          parsed = { error: text };
        }
      } catch {
        setActionError("Invalid response from server.");
        return;
      }
      if (!res.ok || !parsed?.deleted) {
        setActionError(
          parsed?.error ??
            "Could not remove this connection. Please try again.",
        );
        return;
      }

      setPlaceholders((prev) => prev.filter((p) => p.id !== id));
      setPrivateWebEdges((prev) =>
        prev.filter(
          (edge) =>
            edge.sourcePlaceholderId !== id && edge.targetPlaceholderId !== id,
        ),
      );
      setMixedWebEdges((prev) =>
        prev.filter((edge) => edge.placeholderId !== id),
      );
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
    setEditOfferToNameMatch(p.offerToNameMatch);
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
          offerToNameMatch: editOfferToNameMatch,
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
    setActionMessage(
      "Invite link copied. Send it to them so they can join Chart and claim their node.",
    );
    setTimeout(
      () => setCopiedId((prev) => (prev === p.id ? null : prev)),
      2000,
    );
  }

  async function handleConnectPublicly(candidate: PublicConnectCandidate) {
    if (!currentUserId) {
      setActionError("Sign in and reload to connect publicly.");
      return false;
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
        return false;
      }

      setActionMessage(`Public connection request sent to ${candidate.name}.`);
      setPublicConnectCandidates((prev) => {
        const next = { ...prev };
        delete next[candidate.placeholderId];
        return next;
      });
      return true;
    } catch {
      setActionError("Could not send a public connection request.");
      return false;
    } finally {
      setPublicConnectingPlaceholderId(null);
    }
  }

  async function handleConnectSuggestedUser() {
    if (!existingUserSuggestion) return;

    const displayName =
      existingUserSuggestion.user.name ||
      existingUserSuggestion.user.handle ||
      "that person";

    const didConnect = await handleConnectPublicly({
      placeholderId: `suggested-${existingUserSuggestion.user.id}`,
      userId: existingUserSuggestion.user.id,
      name: displayName,
      relationshipType: addType,
    });
    if (didConnect) {
      setExistingUserSuggestion(null);
    }
  }

  async function handleReport(p: PlaceholderPerson) {
    const reason = window
      .prompt(
        `Report ${p.name}. Add a short reason (optional):`,
        "Spam or fake profile",
      )
      ?.trim();

    setReportingId(p.id);
    setActionError(null);
    setActionMessage(null);

    try {
      const res = await authFetch("/api/private-connections/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: p.id,
          reason: reason || undefined,
        }),
      });
      const body = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !body.success) {
        setActionError(body.error ?? "Could not submit report right now.");
        return;
      }

      setActionMessage("Report submitted. Thank you for flagging this node.");
    } catch {
      setActionError("Could not submit report right now.");
    } finally {
      setReportingId(null);
    }
  }

  function renderDuplicateCheckPanel() {
    if (isCheckingDuplicates) {
      return (
        <div className="rounded-xl border border-[var(--border-soft)] bg-black/[0.025] px-3 py-3 text-xs font-semibold text-black/65 dark:bg-white/[0.04] dark:text-white/68">
          Checking your private chart for similar people...
        </div>
      );
    }

    if (duplicateCheckError) {
      return (
        <div className="space-y-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-3">
          <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">
            {duplicateCheckError}
          </p>
          <button
            type="button"
            onClick={() => void createPrivateConnection(true)}
            disabled={isAdding}
            className="rounded-full border border-amber-500/45 px-3 py-1.5 text-xs font-bold text-amber-800 transition hover:bg-amber-500/10 disabled:opacity-60 dark:text-amber-200"
          >
            {isAdding ? "Creating..." : "Create new person anyway"}
          </button>
        </div>
      );
    }

    const suggestion = existingUserSuggestion;

    if (duplicateMatches.length === 0 && !suggestion) {
      return duplicateEmptyMessage ? (
        <p className="text-xs text-black/55 dark:text-white/55">
          {duplicateEmptyMessage}
        </p>
      ) : null;
    }

    const hasMultipleMatches = duplicateMatches.length > 1;
    const suggestionName = suggestion
      ? suggestion.user.name || suggestion.user.handle || "this member"
      : "";
    const isPublicSuggestionConnecting = suggestion
      ? publicConnectingPlaceholderId === `suggested-${suggestion.user.id}`
      : false;

    return (
      <div className="space-y-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-3">
        {suggestion ? (
          <div className="rounded-xl border border-amber-500/25 bg-white/75 p-3 text-xs dark:bg-black/20">
            <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
              {suggestionName} may already be on Chart.
            </p>
            <p className="mt-1 text-amber-800/85 dark:text-amber-100/78">
              {suggestion.message}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void handleConnectSuggestedUser()}
                disabled={
                  isAdding || isPublicSuggestionConnecting || !currentUserId
                }
                className="rounded-full bg-[var(--accent)] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60"
              >
                {isPublicSuggestionConnecting
                  ? "Sending..."
                  : `Connect publicly with ${suggestionName}`}
              </button>
              <button
                type="button"
                onClick={() => void createPrivateConnection(true)}
                disabled={isAdding}
                className="rounded-full border border-amber-500/45 px-3 py-1.5 text-xs font-bold text-amber-900 transition hover:bg-amber-500/10 disabled:opacity-60 dark:text-amber-100"
              >
                {isAdding ? "Creating..." : "Create private node anyway"}
              </button>
            </div>
          </div>
        ) : null}

        {duplicateMatches.length > 0 ? (
          <>
            <div>
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                Is this the person you were trying to add?
              </p>
              <p className="mt-1 text-xs text-amber-800/85 dark:text-amber-100/78">
                They may already be on your chart.
              </p>
            </div>
            <div
              className={
                hasMultipleMatches ? "grid gap-2 md:grid-cols-2" : "grid gap-2"
              }
            >
              {duplicateMatches.map((match) => {
                const details = [
                  match.phoneNumber ? `Phone: ${match.phoneNumber}` : null,
                  match.email ? `Email: ${match.email}` : null,
                  match.location ? `Location: ${match.location}` : null,
                  match.handle ? `Handle: @${match.handle}` : null,
                  match.relationshipType
                    ? `Type: ${match.relationshipType}`
                    : null,
                  match.claimStatus
                    ? `Status: ${STATUS_LABELS[match.claimStatus] ?? match.claimStatus}`
                    : null,
                  match.note ? `Note: ${match.note}` : null,
                ].filter((item): item is string => Boolean(item));

                return (
                  <div
                    key={match.id}
                    className="rounded-xl border border-amber-500/25 bg-white/70 p-3 text-xs dark:bg-black/20"
                  >
                    <p className="font-bold text-black/82 dark:text-white/88">
                      {match.name}
                    </p>
                    {details.length > 0 ? (
                      <div className="mt-2 space-y-1 text-black/62 dark:text-white/68">
                        {details.map((detail) => (
                          <p key={detail}>{detail}</p>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-2 text-black/55 dark:text-white/55">
                        No extra details are saved for this private person.
                      </p>
                    )}
                    {match.reasons.length > 0 ? (
                      <p className="mt-2 text-[11px] font-semibold text-amber-800 dark:text-amber-200">
                        {match.reasons.join(", ")}
                      </p>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => handleUseExistingPerson(match)}
                      className="mt-3 w-full rounded-full bg-[var(--accent)] px-3 py-1.5 text-xs font-bold text-white"
                    >
                      Use existing person
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        ) : null}

        {duplicateMatches.length > 0 ? (
          <button
            type="button"
            onClick={() => void createPrivateConnection(true)}
            disabled={isAdding}
            className="rounded-full border border-amber-500/45 px-3 py-1.5 text-xs font-bold text-amber-900 transition hover:bg-amber-500/10 disabled:opacity-60 dark:text-amber-100"
          >
            {isAdding ? "Creating..." : "Create new person anyway"}
          </button>
        ) : null}
      </div>
    );
  }

  // --- main render ---
  return (
    <div id="manage-connections" className="space-y-6">
      {/* Privacy banner */}

      <section
        className="overflow-hidden rounded-2xl border border-white/10"
        style={{ background: "#0f0819" }}
      >
        <div className="flex flex-col gap-3 border-b border-white/10 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-white/80">
              🔒 Private Chart
            </p>
            <p className="mt-1 text-xs text-white/62">
              Only you can see all connections, including unverified ones.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[10px] text-white/50">
            <span className="rounded-full border border-white/15 px-2 py-0.5">
              🔒 Private = dashed lines (unverified)
            </span>
            <span className="rounded-full border border-white/15 px-2 py-0.5">
              🌍 Public = solid lines (verified)
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
            <clipPath id="current-user-avatar-clip">
              <circle cx="440" cy="220" r="28" />
            </clipPath>
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

          {visiblePrivateWebEdges.map((edge) => {
            const source = chartPositionById.get(
              `private-${edge.sourcePlaceholderId}`,
            );
            const target = chartPositionById.get(
              `private-${edge.targetPlaceholderId}`,
            );

            if (!source || !target) {
              return null;
            }

            const mx = (source.x + target.x) / 2;
            const my = (source.y + target.y) / 2;
            const edgeColor = TYPE_COLORS[edge.relationshipType] ?? "#9ca3af";
            const curvePath = getCurvedPath(
              source.x,
              source.y,
              target.x,
              target.y,
              0.16,
              hashNumber(edge.id),
            );

            return (
              <g key={`web-edge-${edge.id}`}>
                <path
                  d={curvePath}
                  stroke={edgeColor}
                  strokeWidth={1.5}
                  strokeOpacity={0.65}
                  strokeDasharray="7 4"
                  className="private-chart-link-flow"
                  fill="none"
                />
                <g className="private-chart-label-float">
                  <rect
                    x={mx - 34}
                    y={my - 10}
                    width="68"
                    height="18"
                    rx="5"
                    fill="rgba(10,6,20,0.85)"
                    stroke={edgeColor}
                    strokeWidth="0.75"
                    strokeOpacity="0.5"
                  />
                  <text
                    x={mx}
                    y={my + 3}
                    textAnchor="middle"
                    fontSize="10"
                    fontWeight="600"
                    fill={edgeColor}
                    fontFamily="system-ui"
                  >
                    {edge.relationshipType}
                  </text>
                </g>
              </g>
            );
          })}

          {visibleConfirmedWebEdges.map((edge) => {
            const source = chartPositionById.get(`public-${edge.sourceUserId}`);
            const target = chartPositionById.get(`public-${edge.targetUserId}`);

            if (!source || !target) {
              return null;
            }

            const mx = (source.x + target.x) / 2;
            const my = (source.y + target.y) / 2;
            const edgeColor = TYPE_COLORS[edge.relationshipType] ?? "#9ca3af";
            const curvePath = getCurvedPath(
              source.x,
              source.y,
              target.x,
              target.y,
              0.2,
              hashNumber(edge.id),
            );

            return (
              <g key={`confirmed-web-edge-${edge.id}`}>
                <path
                  d={curvePath}
                  stroke={edgeColor}
                  strokeWidth={1.5}
                  strokeOpacity={0.65}
                  className="private-chart-link-flow"
                  fill="none"
                />
                <g className="private-chart-label-float">
                  <rect
                    x={mx - 34}
                    y={my - 10}
                    width="68"
                    height="18"
                    rx="5"
                    fill="rgba(10,6,20,0.85)"
                    stroke={edgeColor}
                    strokeWidth="0.75"
                    strokeOpacity="0.5"
                  />
                  <text
                    x={mx}
                    y={my + 3}
                    textAnchor="middle"
                    fontSize="10"
                    fontWeight="600"
                    fill={edgeColor}
                    fontFamily="system-ui"
                  >
                    {edge.relationshipType}
                  </text>
                </g>
              </g>
            );
          })}

          {visibleMixedWebEdges.map((edge) => {
            const source = chartPositionById.get(
              `private-${edge.placeholderId}`,
            );
            const target = chartPositionById.get(`public-${edge.userId}`);

            if (!source || !target) {
              return null;
            }

            const mx = (source.x + target.x) / 2;
            const my = (source.y + target.y) / 2;
            const edgeColor = TYPE_COLORS[edge.relationshipType] ?? "#9ca3af";
            const curvePath = getCurvedPath(
              source.x,
              source.y,
              target.x,
              target.y,
              0.18,
              hashNumber(edge.id),
            );

            return (
              <g key={`mixed-web-edge-${edge.id}`}>
                <path
                  d={curvePath}
                  stroke={edgeColor}
                  strokeWidth={1.5}
                  strokeOpacity={0.65}
                  strokeDasharray="7 4"
                  className="private-chart-link-flow"
                  fill="none"
                />
                <g className="private-chart-label-float">
                  <rect
                    x={mx - 34}
                    y={my - 10}
                    width="68"
                    height="18"
                    rx="5"
                    fill="rgba(10,6,20,0.85)"
                    stroke={edgeColor}
                    strokeWidth="0.75"
                    strokeOpacity="0.5"
                  />
                  <text
                    x={mx}
                    y={my + 3}
                    textAnchor="middle"
                    fontSize="10"
                    fontWeight="600"
                    fill={edgeColor}
                    fontFamily="system-ui"
                  >
                    {edge.relationshipType}
                  </text>
                </g>
              </g>
            );
          })}

          {chartLayout.map((item) => {
            const cx = 440;
            const cy = 220;
            const mx = (cx + item.x) / 2;
            const my = (cy + item.y) / 2;
            const curvePath = getCurvedPath(
              cx,
              cy,
              item.x,
              item.y,
              item.kind === "public" ? 0.11 : 0.08,
              hashNumber(item.id),
            );

            return (
              <g key={item.id}>
                <path
                  d={curvePath}
                  stroke={item.color}
                  strokeWidth={highlightedConnectionId === item.id ? 3 : 2}
                  strokeOpacity={
                    highlightedConnectionId === item.id ? 0.95 : 0.75
                  }
                  strokeDasharray={item.kind === "private" ? "7 4" : undefined}
                  className={`${highlightedConnectionId === item.id ? "private-connection-line-reveal " : ""}private-chart-link-flow`}
                  fill="none"
                />
                <g className="private-chart-label-float">
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
                </g>

                <g
                  className="private-chart-node-wiggle"
                  style={{
                    animationDuration: `${6 + (hashNumber(item.id) % 5)}s`,
                    animationDelay: `${-((hashNumber(item.id) % 7) * 0.6)}s`,
                  }}
                >
                  <circle
                    cx={item.x}
                    cy={item.y}
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
                    cx={item.x}
                    cy={item.y}
                    r="22"
                    fill={item.color}
                    className={
                      highlightedConnectionId === item.id
                        ? "private-connection-node-reveal"
                        : undefined
                    }
                  />
                  <text
                    x={item.x}
                    y={item.y + 5}
                    textAnchor="middle"
                    fontSize="13"
                    fontWeight="700"
                    fill="white"
                    fontFamily="system-ui"
                  >
                    {(item.name?.[0] ?? "?").toUpperCase()}
                  </text>

                  <rect
                    x={item.x - 48}
                    y={item.y + 30}
                    width="96"
                    height="18"
                    rx="8"
                    fill="rgba(0,0,0,0.6)"
                  />
                  <text
                    x={item.x}
                    y={item.y + 42}
                    textAnchor="middle"
                    fontSize="10"
                    fontWeight="600"
                    fill="rgba(255,255,255,0.88)"
                    fontFamily="system-ui"
                  >
                    {item.name.split(" ")[0]}
                  </text>
                </g>
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
            {currentUserProfileImage ? (
              <>
                <image
                  href={currentUserProfileImage}
                  x="412"
                  y="192"
                  width="56"
                  height="56"
                  preserveAspectRatio="xMidYMid slice"
                  clipPath="url(#current-user-avatar-clip)"
                />
                <circle
                  cx="440"
                  cy="220"
                  r="28"
                  fill="none"
                  stroke="#ff8f84"
                  strokeWidth="2"
                />
              </>
            ) : (
              <>
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
              </>
            )}
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
        {placeholders.length > 0 || combinedWebEdges.length > 0 ? (
          <div className="border-t border-white/10 px-4 py-4">
            <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-white/62">
                  Manage private chart
                </p>
                <p className="text-[11px] text-white/45">
                  Remove private people or links from this chart.
                </p>
              </div>
            </div>

            {placeholders.length > 0 ? (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {placeholders.map((p) => {
                  const color = TYPE_COLORS[p.relationshipType] ?? "#888";
                  const isWorking = workingId === p.id;
                  const isOwned =
                    currentUserId !== null && p.ownerId === currentUserId;

                  return (
                    <div
                      key={`chart-manage-${p.id}`}
                      className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2"
                    >
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: color }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-white/82">
                          {p.name}
                        </p>
                        <p className="text-[10px] uppercase tracking-wide text-white/42">
                          {p.relationshipType}
                        </p>
                      </div>
                      {isOwned ? (
                        <button
                          type="button"
                          onClick={() => handleDelete(p.id)}
                          disabled={isWorking}
                          className="shrink-0 rounded-full border border-red-400/35 px-3 py-1 text-[11px] font-semibold text-red-300 transition hover:bg-red-500/10 disabled:opacity-60"
                        >
                          {isWorking ? "Removing..." : "Remove"}
                        </button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : null}

            {combinedWebEdges.length > 0 ? (
              <div className="mt-3 grid gap-2">
                {combinedWebEdges.map((edge) => {
                  const color = TYPE_COLORS[edge.relationshipType] ?? "#9ca3af";

                  return (
                    <div
                      key={`chart-manage-edge-${edge.id}`}
                      className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2 text-xs"
                    >
                      <span className="font-semibold text-white/80">
                        {edge.sourceName} {" <-> "} {edge.targetName}
                      </span>
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                        style={{
                          backgroundColor: `${color}22`,
                          color,
                          border: `1px solid ${color}44`,
                        }}
                      >
                        {edge.relationshipType}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDeleteAnyWebEdge(edge)}
                        disabled={deletingAnyWebEdgeId === edge.id}
                        className="ml-auto rounded-full border border-red-400/35 px-3 py-1 text-[11px] font-semibold text-red-300 transition hover:bg-red-500/10 disabled:opacity-60"
                      >
                        {deletingAnyWebEdgeId === edge.id
                          ? "Removing..."
                          : "Remove"}
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        ) : null}
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

      <section
        id="add-connection-panel"
        className="paper-card min-w-0 rounded-2xl p-4 sm:p-5"
      >
        {/* Add-connection form */}
        <div id="legacy-add-connection-panel" className="hidden">
          {/* ...existing code... */}
        </div>

        {actionError ? (
          <p className="text-xs text-red-700 dark:text-red-400">
            {actionError}
          </p>
        ) : null}
        {actionMessage ? (
          <p className="text-xs text-green-700 dark:text-green-400">
            {actionMessage}
          </p>
        ) : null}

        {/* Legacy placeholder cards grid */}
        <div className="hidden">{/* ...existing code... */}</div>
      </section>
    </div>
  );
}
