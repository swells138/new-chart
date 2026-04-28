import { prisma } from "@/lib/prisma";
import type { ClaimCandidate, RelationshipType } from "@/types/models";
import {
  buildClaimMetaNote,
  composeClaimMeta,
  encodePendingType,
  parseStoredRelationshipType,
} from "@/lib/relationship-claim-status";

const pendingTypePrefix = "pending::";
const wordCharacters = /[^a-z0-9\s]/g;
const whitespaceCharacters = /\s+/g;
const phoneCharacters = /\D/g;

function isColumnMissingError(error: unknown) {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  if ("code" in error && (error as { code?: string }).code === "P2022") {
    return true;
  }

  const message =
    "message" in error && typeof (error as { message?: unknown }).message === "string"
      ? (error as { message: string }).message
      : String(error);

  return (
    message.includes("does not exist in the current database") ||
    message.includes("column") && message.includes("does not exist")
  );
}

type PlaceholderWithOwner = {
  id: string;
  ownerId: string;
  name: string;
  offerToNameMatch: boolean;
  email: string | null;
  phoneNumber: string | null;
  relationshipType: string;
  note: string | null;
  inviteToken: string | null;
  claimStatus: string;
  linkedUserId: string | null;
  createdAt: Date;
  owner: {
    id: string;
    name: string | null;
    handle: string | null;
  };
};

type ClaimUserRecord = {
  id: string;
  name: string | null;
  email: string | null;
  phoneNumber: string | null;
  ignoredClaimPlaceholderIds: string[];
};

async function getClaimUserRecord(userId: string): Promise<ClaimUserRecord | null> {
  try {
    return await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        phoneNumber: true,
        ignoredClaimPlaceholderIds: true,
      },
    });
  } catch (error) {
    if (!isColumnMissingError(error)) {
      throw error;
    }

    try {
      const legacyUser = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          email: true,
          phoneNumber: true,
        },
      });

      return legacyUser
        ? {
            ...legacyUser,
            ignoredClaimPlaceholderIds: [],
          }
        : null;
    } catch (legacyError) {
      if (!isColumnMissingError(legacyError)) {
        throw legacyError;
      }

      const minimalUser = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
        },
      });

      return minimalUser
        ? {
            id: minimalUser.id,
            name: minimalUser.name,
            email: null,
            phoneNumber: null,
            ignoredClaimPlaceholderIds: [],
          }
        : null;
    }
  }
}

async function getClaimablePlaceholders(userId: string): Promise<PlaceholderWithOwner[]> {
  try {
    return await prisma.placeholderPerson.findMany({
      where: {
        ownerId: { not: userId },
        linkedUserId: null,
        claimStatus: { in: ["unclaimed", "invited"] },
      },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            handle: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 200,
    });
  } catch (error) {
    if (!isColumnMissingError(error)) {
      throw error;
    }

    try {
      const legacyPlaceholders = await prisma.placeholderPerson.findMany({
        where: {
          ownerId: { not: userId },
          linkedUserId: null,
          claimStatus: { in: ["unclaimed", "invited"] },
        },
        select: {
          id: true,
          ownerId: true,
          name: true,
          email: true,
          phoneNumber: true,
          relationshipType: true,
          note: true,
          inviteToken: true,
          claimStatus: true,
          linkedUserId: true,
          createdAt: true,
          owner: {
            select: {
              id: true,
              name: true,
              handle: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 200,
      });

      return legacyPlaceholders.map((placeholder) => ({
        ...placeholder,
        offerToNameMatch: true,
      }));
    } catch (legacyError) {
      if (!isColumnMissingError(legacyError)) {
        throw legacyError;
      }

      const minimalPlaceholders = await prisma.placeholderPerson.findMany({
        where: {
          ownerId: { not: userId },
        },
        select: {
          id: true,
          ownerId: true,
          name: true,
          relationshipType: true,
          linkedUserId: true,
          claimStatus: true,
          createdAt: true,
          owner: {
            select: {
              id: true,
              name: true,
              handle: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 200,
      });

      return minimalPlaceholders
        .filter((placeholder) => placeholder.linkedUserId === null)
        .filter((placeholder) => {
          const status = placeholder.claimStatus?.toLowerCase();
          return !status || status === "unclaimed" || status === "invited";
        })
        .map((placeholder) => ({
          id: placeholder.id,
          ownerId: placeholder.ownerId,
          name: placeholder.name,
          offerToNameMatch: true,
          email: null,
          phoneNumber: null,
          relationshipType: placeholder.relationshipType,
          note: null,
          inviteToken: null,
          claimStatus: placeholder.claimStatus,
          linkedUserId: placeholder.linkedUserId,
          createdAt: placeholder.createdAt,
          owner: placeholder.owner,
        }));
    }
  }
}

function normalizeMatchString(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .replace(wordCharacters, " ")
    .replace(whitespaceCharacters, " ")
    .trim();
}

function normalizePhoneNumber(value: string | null | undefined) {
  const digits = (value ?? "").replace(phoneCharacters, "");
  return digits.length >= 7 ? digits : "";
}

function getNameMatchScore(userName: string, placeholderName: string) {
  const normalizedUser = normalizeMatchString(userName);
  const normalizedPlaceholder = normalizeMatchString(placeholderName);

  if (!normalizedUser || !normalizedPlaceholder) {
    return 0;
  }

  if (normalizedUser === normalizedPlaceholder) {
    return 100;
  }

  const userTokens = normalizedUser.split(" ").filter(Boolean);
  const placeholderTokens = normalizedPlaceholder.split(" ").filter(Boolean);
  const sharedTokens = userTokens.filter((token) => placeholderTokens.includes(token));

  if (sharedTokens.length === 0) {
    return 0;
  }

  const longestSharedToken = sharedTokens.reduce(
    (max, token) => Math.max(max, token.length),
    0
  );
  const overlapRatio = sharedTokens.length / Math.max(userTokens.length, placeholderTokens.length);

  return Math.round(overlapRatio * 70 + Math.min(longestSharedToken * 4, 20));
}

async function buildApprovedNeighborMap(userIds: string[]) {
  if (userIds.length === 0) {
    return new Map<string, Set<string>>();
  }

  const relationships = await prisma.relationship.findMany({
    where: {
      NOT: {
        type: {
          startsWith: pendingTypePrefix,
        },
      },
      OR: [
        { user1Id: { in: userIds } },
        { user2Id: { in: userIds } },
      ],
    },
    select: {
      user1Id: true,
      user2Id: true,
    },
  });

  const map = new Map<string, Set<string>>();

  userIds.forEach((userId) => {
    map.set(userId, new Set<string>());
  });

  relationships.forEach((relationship) => {
    if (map.has(relationship.user1Id)) {
      map.get(relationship.user1Id)?.add(relationship.user2Id);
    }
    if (map.has(relationship.user2Id)) {
      map.get(relationship.user2Id)?.add(relationship.user1Id);
    }
  });

  return map;
}

function toClaimCandidate(
  placeholder: PlaceholderWithOwner,
  mutualConnectionNames: string[],
  matchReasons: string[]
): ClaimCandidate {
  return {
    placeholderId: placeholder.id,
    name: placeholder.name,
    email: placeholder.email ?? "",
    phoneNumber: placeholder.phoneNumber ?? "",
    relationshipType: placeholder.relationshipType as RelationshipType,
    note: placeholder.note ?? "",
    ownerId: placeholder.ownerId,
    ownerName: placeholder.owner.name ?? "Someone",
    ownerHandle: placeholder.owner.handle ?? "",
    mutualConnectionNames,
    mutualConnectionCount: mutualConnectionNames.length,
    matchReasons,
  };
}

export async function getClaimCandidatesForUser(
  userId: string,
  options?: { alternateNames?: string[]; includeDismissed?: boolean; limit?: number }
) {
  const includeDismissed = options?.includeDismissed ?? false;
  const limit = options?.limit ?? 5;

  try {
    const currentUser = await getClaimUserRecord(userId);

    if (!currentUser) {
      return [] as ClaimCandidate[];
    }

    const placeholders = await getClaimablePlaceholders(userId);

    const visiblePlaceholders = (includeDismissed
      ? placeholders
      : placeholders.filter(
          (placeholder) => !currentUser.ignoredClaimPlaceholderIds.includes(placeholder.id)
        ))
      .filter((placeholder) => placeholder.offerToNameMatch !== false);

    const ownerIds = Array.from(new Set(visiblePlaceholders.map((placeholder) => placeholder.ownerId)));

    // If there is already an active or pending relationship between these two users,
    // suppress additional claim prompts to avoid repeated loops.
    const pairRelationshipRows = ownerIds.length
      ? await prisma.relationship.findMany({
          where: {
            OR: [
              { user1Id: userId, user2Id: { in: ownerIds } },
              { user2Id: userId, user1Id: { in: ownerIds } },
            ],
          },
          select: {
            user1Id: true,
            user2Id: true,
            type: true,
            note: true,
          },
        })
      : [];

    const relatedOwnerIds = new Set<string>();
    pairRelationshipRows.forEach((relationship) => {
      const otherUserId = relationship.user1Id === userId ? relationship.user2Id : relationship.user1Id;
      relatedOwnerIds.add(otherUserId);
    });

    // Suppress by already-claimed placeholders between the same pair,
    // even if relationship state is in transition.
    const claimedPairPlaceholders = ownerIds.length
      ? await prisma.placeholderPerson.findMany({
          where: {
            claimStatus: "claimed",
            OR: [
              { ownerId: { in: ownerIds }, linkedUserId: userId },
              { ownerId: userId, linkedUserId: { in: ownerIds } },
            ],
          },
          select: {
            ownerId: true,
            linkedUserId: true,
          },
        })
      : [];

    const claimedOwnerIds = new Set<string>();
    claimedPairPlaceholders.forEach((placeholder) => {
      if (placeholder.ownerId !== userId) {
        claimedOwnerIds.add(placeholder.ownerId);
      }
      if (placeholder.linkedUserId && placeholder.linkedUserId !== userId) {
        claimedOwnerIds.add(placeholder.linkedUserId);
      }
    });

    const dedupedPlaceholders = new Map<string, PlaceholderWithOwner>();
    visiblePlaceholders
      .forEach((placeholder) => {
        const key = `${placeholder.ownerId}::${normalizeMatchString(placeholder.name)}`;
        const existing = dedupedPlaceholders.get(key);
        if (!existing || placeholder.createdAt > existing.createdAt) {
          dedupedPlaceholders.set(key, placeholder);
        }
      });

    const filteredPlaceholders = Array.from(dedupedPlaceholders.values());
    const neighborMap = await buildApprovedNeighborMap([currentUser.id, ...ownerIds]);
    const currentNeighbors = neighborMap.get(currentUser.id) ?? new Set<string>();

    const mutualConnectionIds = Array.from(currentNeighbors);
    const mutualUsers = mutualConnectionIds.length
      ? await prisma.user.findMany({
          where: { id: { in: mutualConnectionIds } },
          select: { id: true, name: true, handle: true },
        })
      : [];
    const mutualUserNames = new Map(
      mutualUsers.map((user) => [user.id, user.name ?? user.handle ?? "Member"])
    );

    const currentUserEmail = (currentUser.email ?? "").trim().toLowerCase();
    const currentUserPhone = normalizePhoneNumber(currentUser.phoneNumber);
    const candidateNames = Array.from(
      new Set(
        [currentUser.name, ...(options?.alternateNames ?? [])]
          .map((name) => normalizeMatchString(name))
          .filter(Boolean),
      ),
    );

    const rankedCandidates = filteredPlaceholders
      .map((placeholder) => {
        const ownerNeighbors = neighborMap.get(placeholder.ownerId) ?? new Set<string>();
        const sharedConnectionIds = Array.from(ownerNeighbors).filter((connectionId) =>
          currentNeighbors.has(connectionId)
        );

        const mutualConnectionNames = sharedConnectionIds
          .map((connectionId) => mutualUserNames.get(connectionId))
          .filter((name): name is string => Boolean(name))
          .slice(0, 3);

        const nameScore = Math.max(
          0,
          ...candidateNames.map((name) => getNameMatchScore(name, placeholder.name)),
        );
        const emailMatches =
          currentUserEmail.length > 0 &&
          (placeholder.email ?? "").trim().toLowerCase() === currentUserEmail;
        const phoneMatches =
          currentUserPhone.length > 0 &&
          normalizePhoneNumber(placeholder.phoneNumber) === currentUserPhone;
        const hasStrongIdentityMatch =
          nameScore >= 100 || emailMatches || phoneMatches;

        if (claimedOwnerIds.has(placeholder.ownerId) && !hasStrongIdentityMatch) {
          return null;
        }

        if (relatedOwnerIds.has(placeholder.ownerId) && !hasStrongIdentityMatch) {
          return null;
        }

        const score =
          nameScore +
          (emailMatches ? 120 : 0) +
          (phoneMatches ? 110 : 0) +
          sharedConnectionIds.length * 15;

        const matchReasons: string[] = [];

        if (emailMatches) {
          matchReasons.push("Email matches");
        }
        if (phoneMatches) {
          matchReasons.push("Phone matches");
        }
        if (nameScore >= 100) {
          matchReasons.push("Exact name match");
        } else if (nameScore >= 55) {
          matchReasons.push("Similar name");
        }
        if (sharedConnectionIds.length > 0) {
          matchReasons.push(
            sharedConnectionIds.length === 1
              ? "1 shared confirmed connection"
              : `${sharedConnectionIds.length} shared confirmed connections`
          );
        }

        return {
          placeholder,
          mutualConnectionNames,
          matchReasons,
          score,
        };
      })
      .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))
      .filter((candidate) => candidate.score >= 55 || candidate.matchReasons.some((reason) => reason.includes("matches")))
      .sort((left, right) => right.score - left.score)
      .slice(0, limit)
      .map((candidate) =>
        toClaimCandidate(
          candidate.placeholder,
          candidate.mutualConnectionNames,
          candidate.matchReasons
        )
      );

    return rankedCandidates;
  } catch {
    // Compatibility fallback while a rollout is ahead of database migrations.
    return [] as ClaimCandidate[];
  }
}

export async function getClaimCandidateDiagnosticsForUser(
  userId: string,
  options?: { alternateNames?: string[]; limit?: number },
) {
  const limit = options?.limit ?? 10;

  try {
    const currentUser = await getClaimUserRecord(userId);

    if (!currentUser) {
      return {
        user: null,
        candidateNames: [],
        matches: [],
        queryError: "Current user was not found.",
      };
    }

    const currentUserEmail = (currentUser.email ?? "").trim().toLowerCase();
    const currentUserPhone = normalizePhoneNumber(currentUser.phoneNumber);
    const candidateNames = Array.from(
      new Set(
        [currentUser.name, ...(options?.alternateNames ?? [])]
          .map((name) => normalizeMatchString(name))
          .filter(Boolean),
      ),
    );

    let placeholders: PlaceholderWithOwner[] = [];
    try {
      placeholders = await prisma.placeholderPerson.findMany({
        include: {
          owner: {
            select: {
              id: true,
              name: true,
              handle: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 300,
      });
    } catch (error) {
      if (!isColumnMissingError(error)) {
        throw error;
      }

      try {
        const legacyPlaceholders = await prisma.placeholderPerson.findMany({
          select: {
            id: true,
            ownerId: true,
            name: true,
            email: true,
            phoneNumber: true,
            relationshipType: true,
            note: true,
            inviteToken: true,
            claimStatus: true,
            linkedUserId: true,
            createdAt: true,
            owner: {
              select: {
                id: true,
                name: true,
                handle: true,
              },
            },
          },
          orderBy: {
            createdAt: "desc",
          },
          take: 300,
        });

        placeholders = legacyPlaceholders.map((placeholder) => ({
          ...placeholder,
          offerToNameMatch: true,
        }));
      } catch (legacyError) {
        if (!isColumnMissingError(legacyError)) {
          throw legacyError;
        }

        const minimalPlaceholders = await prisma.placeholderPerson.findMany({
          select: {
            id: true,
            ownerId: true,
            name: true,
            relationshipType: true,
            linkedUserId: true,
            claimStatus: true,
            createdAt: true,
            owner: {
              select: {
                id: true,
                name: true,
                handle: true,
              },
            },
          },
          orderBy: {
            createdAt: "desc",
          },
          take: 300,
        });

        placeholders = minimalPlaceholders.map((placeholder) => ({
          ...placeholder,
          offerToNameMatch: true,
          email: null,
          phoneNumber: null,
          note: null,
          inviteToken: null,
        }));
      }
    }

    const scoredPlaceholders = placeholders
      .map((placeholder) => {
        const nameScore = Math.max(
          0,
          ...candidateNames.map((name) => getNameMatchScore(name, placeholder.name)),
        );
        const emailMatches =
          currentUserEmail.length > 0 &&
          (placeholder.email ?? "").trim().toLowerCase() === currentUserEmail;
        const phoneMatches =
          currentUserPhone.length > 0 &&
          normalizePhoneNumber(placeholder.phoneNumber) === currentUserPhone;

        return {
          placeholder,
          nameScore,
          emailMatches,
          phoneMatches,
        };
      })
      .filter(
        (item) =>
          item.nameScore >= 55 || item.emailMatches || item.phoneMatches,
      )
      .slice(0, limit);

    const ownerIds = Array.from(
      new Set(scoredPlaceholders.map((item) => item.placeholder.ownerId)),
    );
    const pairRelationshipRows = ownerIds.length
      ? await prisma.relationship.findMany({
          where: {
            OR: [
              { user1Id: userId, user2Id: { in: ownerIds } },
              { user2Id: userId, user1Id: { in: ownerIds } },
            ],
          },
          select: {
            user1Id: true,
            user2Id: true,
            type: true,
          },
        })
      : [];
    const relatedOwnerIds = new Set(
      pairRelationshipRows.map((relationship) =>
        relationship.user1Id === userId ? relationship.user2Id : relationship.user1Id,
      ),
    );
    const claimedPairPlaceholders = ownerIds.length
      ? await prisma.placeholderPerson.findMany({
          where: {
            claimStatus: "claimed",
            OR: [
              { ownerId: { in: ownerIds }, linkedUserId: userId },
              { ownerId: userId, linkedUserId: { in: ownerIds } },
            ],
          },
          select: {
            ownerId: true,
            linkedUserId: true,
          },
        })
      : [];
    const claimedOwnerIds = new Set<string>();
    claimedPairPlaceholders.forEach((placeholder) => {
      if (placeholder.ownerId !== userId) {
        claimedOwnerIds.add(placeholder.ownerId);
      }
      if (placeholder.linkedUserId && placeholder.linkedUserId !== userId) {
        claimedOwnerIds.add(placeholder.linkedUserId);
      }
    });

    return {
      user: {
        id: currentUser.id,
        name: currentUser.name,
        hasEmail: Boolean(currentUserEmail),
        hasPhone: Boolean(currentUserPhone),
        ignoredCount: currentUser.ignoredClaimPlaceholderIds.length,
      },
      candidateNames,
      matches: scoredPlaceholders.map((item) => {
        const placeholder = item.placeholder;
        const reasons: string[] = [];
        const status = placeholder.claimStatus?.toLowerCase();
        const hasStrongIdentityMatch =
          item.nameScore >= 100 || item.emailMatches || item.phoneMatches;

        if (placeholder.ownerId === userId) reasons.push("same-account-owner");
        if (placeholder.linkedUserId === userId) reasons.push("already-linked-to-you");
        if (placeholder.linkedUserId && placeholder.linkedUserId !== userId) {
          reasons.push("linked-to-another-user");
        }
        if (status !== "unclaimed" && status !== "invited") {
          reasons.push(`status-${status || "missing"}`);
        }
        if (currentUser.ignoredClaimPlaceholderIds.includes(placeholder.id)) {
          reasons.push("dismissed-by-you");
        }
        if (placeholder.offerToNameMatch === false) {
          reasons.push("claim-suggestions-off");
        }
        if (claimedOwnerIds.has(placeholder.ownerId) && !hasStrongIdentityMatch) {
          reasons.push("already-claimed-between-this-pair");
        }
        if (relatedOwnerIds.has(placeholder.ownerId) && !hasStrongIdentityMatch) {
          reasons.push("existing-relationship-weak-match");
        }
        if (reasons.length === 0) {
          reasons.push("eligible");
        }

        return {
          placeholderId: placeholder.id,
          placeholderName: placeholder.name,
          ownerId: placeholder.ownerId,
          ownerName: placeholder.owner.name ?? "Someone",
          claimStatus: placeholder.claimStatus,
          linkedToCurrentUser: placeholder.linkedUserId === userId,
          hasLinkedUser: Boolean(placeholder.linkedUserId),
          offerToNameMatch: placeholder.offerToNameMatch,
          nameScore: item.nameScore,
          emailMatches: item.emailMatches,
          phoneMatches: item.phoneMatches,
          reasons,
        };
      }),
      queryError: null,
    };
  } catch (error) {
    return {
      user: null,
      candidateNames: [],
      matches: [],
      queryError: error instanceof Error ? error.message : "Unknown claim diagnostic error.",
    };
  }
}

export async function dismissClaimCandidate(userId: string, placeholderId: string) {
  let user: { ignoredClaimPlaceholderIds: string[] } | null = null;

  try {
    user = await prisma.user.findUnique({
      where: { id: userId },
      select: { ignoredClaimPlaceholderIds: true },
    });
  } catch (error) {
    if (isColumnMissingError(error)) {
      // Older DB schema without ignored placeholders: treat dismiss as a no-op.
      return;
    }
    throw error;
  }

  if (!user) {
    throw new Error("User not found.");
  }

  if (user.ignoredClaimPlaceholderIds.includes(placeholderId)) {
    return;
  }

  try {
    await prisma.user.update({
      where: { id: userId },
      data: {
        ignoredClaimPlaceholderIds: [...user.ignoredClaimPlaceholderIds, placeholderId],
      },
    });
  } catch (error) {
    if (isColumnMissingError(error)) {
      // Older DB schema without ignored placeholders: treat dismiss as a no-op.
      return;
    }
    throw error;
  }
}

export async function claimPlaceholderForUser(userId: string, placeholderId: string) {
  const result = await prisma.$transaction(async (tx) => {
    const placeholder = await tx.placeholderPerson.findUnique({
      where: { id: placeholderId },
      select: {
        id: true,
        ownerId: true,
        relationshipType: true,
        linkedUserId: true,
        note: true,
        owner: {
          select: { id: true, name: true },
        },
      },
    });

    if (!placeholder) {
      throw new Error("Placeholder not found.");
    }

    if (placeholder.ownerId === userId) {
      throw new Error("You cannot claim a node you created.");
    }

    if (placeholder.linkedUserId && placeholder.linkedUserId !== userId) {
      throw new Error("This node has already been claimed.");
    }

    const existingRelationship = await tx.relationship.findFirst({
      where: {
        OR: [
          { user1Id: placeholder.ownerId, user2Id: userId },
          { user1Id: userId, user2Id: placeholder.ownerId },
        ],
      },
      select: {
        id: true,
        user1Id: true,
        user2Id: true,
        type: true,
        note: true,
      },
    });

    let relationshipId: string | null = null;
    let alreadyConnected = false;

    const claimConfirmedAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const pendingMeta = buildClaimMetaNote({
      status: "pending_creator_confirmation",
      creatorId: placeholder.ownerId,
      claimedByUserId: userId,
      claimConfirmedAt,
      expiresAt,
      disputeReason: null,
    });
    const pendingType = encodePendingType(
      placeholder.relationshipType as RelationshipType,
      placeholder.ownerId,
      userId,
    );

    if (!existingRelationship) {
      // Create relationship in pending_creator_confirmation state — not public until creator confirms.
      const relationship = await tx.relationship.create({
        data: {
          user1Id: placeholder.ownerId,
          user2Id: userId,
          type: pendingType,
          note: pendingMeta,
          isPublic: false,
        },
        select: { id: true },
      });
      relationshipId = relationship.id;
    } else {
      alreadyConnected = !existingRelationship.type.startsWith(pendingTypePrefix);
      relationshipId = existingRelationship.id;

      const existingMeta = composeClaimMeta({
        storedType: existingRelationship.type,
        user1Id: existingRelationship.user1Id,
        user2Id: existingRelationship.user2Id,
        note: existingRelationship.note,
      });

      // If the existing pending relationship was initiated by the claimer (userId),
      // and the placeholder owner is now accepting by being the claimed user on the
      // other side, both sides have effectively confirmed. Auto-resolve to active.
      const crossConfirm =
        existingMeta.status === "pending_creator_confirmation" &&
        existingMeta.creatorId === userId;

      if (crossConfirm) {
        const baseType = parseStoredRelationshipType(
          existingRelationship.type,
          existingRelationship.user1Id,
          existingRelationship.user2Id,
        ).baseType;
        await tx.relationship.update({
          where: { id: existingRelationship.id },
          data: {
            type: baseType,
            note: "",
            isPublic: true,
          },
        });
        alreadyConnected = true;
      } else {
        // Move even an existing active relationship into creator confirmation
        // so the placeholder owner gets the final say for this claim.
        await tx.relationship.update({
          where: { id: existingRelationship.id },
          data: {
            type: pendingType,
            note: pendingMeta,
            isPublic: false,
          },
        });
      }
    }

    await tx.placeholderPerson.update({
      where: { id: placeholder.id },
      data: {
        linkedUserId: userId,
        claimStatus: "claimed",
        inviteToken: null,
      },
      select: { id: true },
    });

    try {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { ignoredClaimPlaceholderIds: true },
      });

      if (user && !user.ignoredClaimPlaceholderIds.includes(placeholder.id)) {
        await tx.user.update({
          where: { id: userId },
          data: {
            ignoredClaimPlaceholderIds: [...user.ignoredClaimPlaceholderIds, placeholder.id],
          },
        });
      }
    } catch (error) {
      if (!isColumnMissingError(error)) {
        throw error;
      }
      // Older DB schema without ignored placeholders: skip claim suppression.
    }

    return {
      ownerId: placeholder.ownerId,
      ownerName: placeholder.owner.name ?? "Someone",
      relationshipType: placeholder.relationshipType,
      relationshipId,
      alreadyConnected,
    };
  });

  try {
    await prisma.message.create({
      data: {
        senderId: userId,
        recipientId: result.ownerId,
        content: `Someone accepted the placeholder you created as themselves. Head to your profile to confirm — is this who you intended?`,
      },
    });
  } catch {
    // Non-fatal notification failure.
  }

  return result;
}

export interface PendingCreatorConfirmation {
  relationshipId: string;
  creatorId: string;
  claimedByUserId: string;
  claimedByName: string;
  claimedByHandle: string;
  placeholderName: string;
  relationshipType: string;
  expiresAt: string | null;
}

export async function getPendingCreatorConfirmations(
  creatorId: string,
): Promise<PendingCreatorConfirmation[]> {
  // Find relationships where the creator is waiting to confirm a claim.
  // These are stored as pending:: type + pending_creator_confirmation note.
  let relationships: {
    id: string;
    user1Id: string;
    user2Id: string;
    type: string;
    note: string | null;
  }[] = [];

  try {
    relationships = await prisma.relationship.findMany({
      where: {
        OR: [{ user1Id: creatorId }, { user2Id: creatorId }],
        type: { startsWith: pendingTypePrefix },
      },
      select: {
        id: true,
        user1Id: true,
        user2Id: true,
        type: true,
        note: true,
      },
      orderBy: { createdAt: "desc" },
    });
  } catch {
    return [];
  }

  const results: PendingCreatorConfirmation[] = [];

  for (const rel of relationships) {
    const claimMeta = composeClaimMeta({
      storedType: rel.type,
      user1Id: rel.user1Id,
      user2Id: rel.user2Id,
      note: rel.note,
    });

    if (claimMeta.status !== "pending_creator_confirmation") continue;
    if (claimMeta.creatorId !== creatorId) continue;

    const claimedByUserId = claimMeta.claimedByUserId;
    if (!claimedByUserId) continue;

    // Find the placeholder that corresponds to this relationship.
    const placeholder = await prisma.placeholderPerson.findFirst({
      where: {
        ownerId: creatorId,
        linkedUserId: claimedByUserId,
        claimStatus: "claimed",
      },
      select: { name: true, relationshipType: true },
    });

    const claimer = await prisma.user.findUnique({
      where: { id: claimedByUserId },
      select: { name: true, handle: true },
    });

    const parsedType = parseStoredRelationshipType(rel.type, rel.user1Id, rel.user2Id);

    results.push({
      relationshipId: rel.id,
      creatorId,
      claimedByUserId,
      claimedByName: claimer?.name ?? "Someone",
      claimedByHandle: claimer?.handle ?? "",
      placeholderName: placeholder?.name ?? claimer?.name ?? "Someone",
      relationshipType: placeholder?.relationshipType ?? parsedType.baseType,
      expiresAt: claimMeta.expiresAt ?? null,
    });
  }

  return results;
}
