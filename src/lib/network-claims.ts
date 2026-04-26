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
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2022"
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
  options?: { includeDismissed?: boolean; limit?: number }
) {
  const includeDismissed = options?.includeDismissed ?? false;
  const limit = options?.limit ?? 5;

  try {
    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        phoneNumber: true,
        ignoredClaimPlaceholderIds: true,
      },
    });

    if (!currentUser) {
      return [] as ClaimCandidate[];
    }

    const placeholders = await prisma.placeholderPerson.findMany({
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

    const visiblePlaceholders = (includeDismissed
      ? placeholders
      : placeholders.filter(
          (placeholder) => !currentUser.ignoredClaimPlaceholderIds.includes(placeholder.id)
        ))
      .filter((placeholder) => placeholder.offerToNameMatch !== false);

    const ownerIds = Array.from(new Set(visiblePlaceholders.map((placeholder) => placeholder.ownerId)));
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

    const rankedCandidates = visiblePlaceholders
      .map((placeholder) => {
        const ownerNeighbors = neighborMap.get(placeholder.ownerId) ?? new Set<string>();
        const sharedConnectionIds = Array.from(ownerNeighbors).filter((connectionId) =>
          currentNeighbors.has(connectionId)
        );

        const mutualConnectionNames = sharedConnectionIds
          .map((connectionId) => mutualUserNames.get(connectionId))
          .filter((name): name is string => Boolean(name))
          .slice(0, 3);

        const nameScore = getNameMatchScore(currentUser.name ?? "", placeholder.name);
        const emailMatches =
          currentUserEmail.length > 0 &&
          (placeholder.email ?? "").trim().toLowerCase() === currentUserEmail;
        const phoneMatches =
          currentUserPhone.length > 0 &&
          normalizePhoneNumber(placeholder.phoneNumber) === currentUserPhone;

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
      include: {
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
    });

    let pendingRelationshipId: string | null = null;
    let alreadyConnected = false;

    if (!existingRelationship) {
      const claimConfirmedAt = new Date().toISOString();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const relationship = await tx.relationship.create({
        data: {
          user1Id: placeholder.ownerId,
          user2Id: userId,
          type: encodePendingType(
            placeholder.relationshipType as RelationshipType,
            placeholder.ownerId,
            userId,
          ),
          note: buildClaimMetaNote({
            status: "pending_creator_confirmation",
            creatorId: placeholder.ownerId,
            claimedByUserId: userId,
            claimConfirmedAt,
            expiresAt,
            disputeReason: null,
          }),
        },
        select: { id: true },
      });
      pendingRelationshipId = relationship.id;
    } else {
      alreadyConnected = !existingRelationship.type.startsWith(pendingTypePrefix);
      pendingRelationshipId = existingRelationship.id;

      if (!alreadyConnected) {
        const parsedType = parseStoredRelationshipType(
          existingRelationship.type,
          existingRelationship.user1Id,
          existingRelationship.user2Id,
        );
        const claimConfirmedAt = new Date().toISOString();
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        const meta = composeClaimMeta({
          storedType: existingRelationship.type,
          user1Id: existingRelationship.user1Id,
          user2Id: existingRelationship.user2Id,
          note: existingRelationship.note,
        });

        await tx.relationship.update({
          where: { id: existingRelationship.id },
          data: {
            type: encodePendingType(parsedType.baseType, placeholder.ownerId, userId),
            note: buildClaimMetaNote({
              ...meta,
              status: "pending_creator_confirmation",
              creatorId: placeholder.ownerId,
              claimedByUserId: userId,
              claimConfirmedAt,
              expiresAt,
              disputeReason: null,
            }),
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
    });

    try {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { ignoredClaimPlaceholderIds: true },
      });

      if (user && user.ignoredClaimPlaceholderIds.includes(placeholder.id)) {
        await tx.user.update({
          where: { id: userId },
          data: {
            ignoredClaimPlaceholderIds: user.ignoredClaimPlaceholderIds.filter(
              (item) => item !== placeholder.id
            ),
          },
        });
      }
    } catch (error) {
      if (!isColumnMissingError(error)) {
        throw error;
      }
      // Older DB schema without ignored placeholders: skip cleanup.
    }

    return {
      ownerId: placeholder.ownerId,
      ownerName: placeholder.owner.name ?? "Someone",
      relationshipType: placeholder.relationshipType,
      pendingRelationshipId,
      alreadyConnected,
    };
  });

  try {
    await prisma.message.create({
      data: {
        senderId: userId,
        recipientId: result.ownerId,
        content: `${result.ownerName ? "A claimed node" : "Someone"} was matched to a real account. Review the pending connection in Your Network.`,
      },
    });
  } catch {
    // Non-fatal notification failure.
  }

  return result;
}