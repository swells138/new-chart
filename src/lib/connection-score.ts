import { prisma } from "@/lib/prisma";
import { pendingTypePrefix } from "@/lib/relationship-claim-status";
import type { PrismaClient, Prisma } from "@prisma/client";

type PrismaExecutor = PrismaClient | Prisma.TransactionClient;

const activeRelationshipWhere = {
  NOT: {
    type: {
      startsWith: pendingTypePrefix,
    },
  },
} as const;

export function calculateConnectionScore(input: {
  totalConnections: number;
  secondDegreeConnections: number;
}) {
  return input.totalConnections * 5 + input.secondDegreeConnections;
}

export async function recalculateConnectionScoresForUsers(
  userIds: string[],
  db: PrismaExecutor = prisma,
) {
  const seedUserIds = Array.from(new Set(userIds.filter(Boolean)));

  if (seedUserIds.length === 0) {
    return;
  }

  const adjacentRelationships = await db.relationship.findMany({
    where: {
      ...activeRelationshipWhere,
      OR: [
        { user1Id: { in: seedUserIds } },
        { user2Id: { in: seedUserIds } },
      ],
    },
    select: {
      user1Id: true,
      user2Id: true,
    },
  });

  const impactedUserIds = new Set(seedUserIds);
  adjacentRelationships.forEach((relationship) => {
    impactedUserIds.add(relationship.user1Id);
    impactedUserIds.add(relationship.user2Id);
  });

  await Promise.all(
    Array.from(impactedUserIds).map(async (userId) => {
      const directRelationships = await db.relationship.findMany({
        where: {
          ...activeRelationshipWhere,
          OR: [{ user1Id: userId }, { user2Id: userId }],
        },
        select: {
          user1Id: true,
          user2Id: true,
        },
      });

      const directConnectionIds = new Set<string>();
      directRelationships.forEach((relationship) => {
        directConnectionIds.add(
          relationship.user1Id === userId
            ? relationship.user2Id
            : relationship.user1Id,
        );
      });

      const directIds = Array.from(directConnectionIds);
      const secondDegreeConnectionIds = new Set<string>();

      if (directIds.length > 0) {
        const secondDegreeRelationships = await db.relationship.findMany({
          where: {
            ...activeRelationshipWhere,
            OR: [
              { user1Id: { in: directIds } },
              { user2Id: { in: directIds } },
            ],
          },
          select: {
            user1Id: true,
            user2Id: true,
          },
        });

        secondDegreeRelationships.forEach((relationship) => {
          if (directConnectionIds.has(relationship.user1Id)) {
            secondDegreeConnectionIds.add(relationship.user2Id);
          }
          if (directConnectionIds.has(relationship.user2Id)) {
            secondDegreeConnectionIds.add(relationship.user1Id);
          }
        });
      }

      secondDegreeConnectionIds.delete(userId);
      directConnectionIds.forEach((directId) => {
        secondDegreeConnectionIds.delete(directId);
      });

      const totalConnections = directConnectionIds.size;
      const secondDegreeConnections = secondDegreeConnectionIds.size;

      await db.user.update({
        where: { id: userId },
        data: {
          totalConnections,
          secondDegreeConnections,
          connectionScore: calculateConnectionScore({
            totalConnections,
            secondDegreeConnections,
          }),
        },
      });
    }),
  );
}
