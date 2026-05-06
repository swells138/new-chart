import type { Relationship } from "@/types/models";

export type ConnectionDistanceResult =
  | {
      status: "connected";
      distance: number;
      degree: number;
      path: string[];
      hasMultiplePaths: boolean;
    }
  | {
      status: "no_connection";
      message: "No connection found";
      distance: null;
      degree: null;
      path: [];
      hasMultiplePaths: false;
    };

export function calculateShortestConnectionPath(
  relationships: Pick<Relationship, "source" | "target">[],
  currentUserId: string | null | undefined,
  targetUserId: string | null | undefined,
): ConnectionDistanceResult | null {
  if (!currentUserId || !targetUserId) {
    return null;
  }

  if (currentUserId === targetUserId) {
    return {
      status: "connected",
      distance: 0,
      degree: 0,
      path: [currentUserId],
      hasMultiplePaths: false,
    };
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
    [currentUserId, null],
  ]);
  const distanceByUserId = new Map<string, number>([[currentUserId, 0]]);
  const shortestPathCountByUserId = new Map<string, number>([[currentUserId, 1]]);
  const queue = [currentUserId];

  while (queue.length > 0) {
    const userId = queue.shift();
    if (!userId) {
      continue;
    }

    const currentDistance = distanceByUserId.get(userId) ?? 0;
    const neighbors = neighborsByUserId.get(userId) ?? new Set<string>();

    for (const neighborId of neighbors) {
      const nextDistance = currentDistance + 1;
      const knownDistance = distanceByUserId.get(neighborId);

      if (knownDistance === nextDistance) {
        shortestPathCountByUserId.set(
          neighborId,
          Math.min(
            2,
            (shortestPathCountByUserId.get(neighborId) ?? 0) +
              (shortestPathCountByUserId.get(userId) ?? 1),
          ),
        );
      }

      if (knownDistance !== undefined) {
        continue;
      }

      parentByUserId.set(neighborId, userId);
      distanceByUserId.set(neighborId, nextDistance);
      shortestPathCountByUserId.set(
        neighborId,
        shortestPathCountByUserId.get(userId) ?? 1,
      );
      queue.push(neighborId);
    }
  }

  if (!parentByUserId.has(targetUserId)) {
    return {
      status: "no_connection",
      message: "No connection found",
      distance: null,
      degree: null,
      path: [],
      hasMultiplePaths: false,
    };
  }

  const path: string[] = [];
  let pathUserId: string | null = targetUserId;

  while (pathUserId) {
    path.push(pathUserId);
    pathUserId = parentByUserId.get(pathUserId) ?? null;
  }

  path.reverse();

  return {
    status: "connected",
    distance: path.length - 1,
    degree: path.length - 1,
    path,
    hasMultiplePaths: (shortestPathCountByUserId.get(targetUserId) ?? 0) > 1,
  };
}
