/**
 * Database query helpers using Prisma
 *
 * Replace the static JSON imports in data.ts with these dynamic queries
 * as you migrate to the database.
 */

import { prisma } from "./prisma";
import type { Prisma } from "@prisma/client";
import { recalculateConnectionScoresForUsers } from "@/lib/connection-score";
import { getEffectiveIsPro } from "@/lib/pro-user";
import type {
  User,
  Post,
  Relationship,
  PlaceholderPerson,
  RelationshipType,
} from "@/types/models";
import {
  buildClaimMetaNote,
  composeClaimMeta,
  hasExpiredPendingConfirmation,
  parseStoredRelationshipType,
  pendingTypePrefix,
} from "@/lib/relationship-claim-status";

const baseUserSelect = {
  id: true,
  name: true,
  firstName: true,
  lastName: true,
  email: true,
  handle: true,
  pronouns: true,
  bio: true,
  interests: true,
  relationshipStatus: true,
  location: true,
  links: true,
  featured: true,
  isPro: true,
  connectionScore: true,
  totalConnections: true,
  secondDegreeConnections: true,
  profileImage: true,
} as const satisfies Prisma.UserSelect;

const legacyUserSelect = {
  id: true,
  name: true,
  handle: true,
  pronouns: true,
  bio: true,
  interests: true,
  relationshipStatus: true,
  location: true,
  links: true,
  featured: true,
} as const satisfies Prisma.UserSelect;

const basePlaceholderSelect = {
  id: true,
  ownerId: true,
  name: true,
  offerToNameMatch: true,
  relationshipType: true,
  note: true,
  inviteToken: true,
  linkedUserId: true,
  claimStatus: true,
  createdAt: true,
} as const;

function formatRelativeTime(timestamp: Date) {
  const differenceInMs = Date.now() - timestamp.getTime();
  const differenceInHours = Math.max(
    1,
    Math.round(differenceInMs / (1000 * 60 * 60)),
  );

  if (differenceInHours < 24) {
    return `${differenceInHours}h ago`;
  }

  const differenceInDays = Math.round(differenceInHours / 24);
  return `${differenceInDays}d ago`;
}

function normalizeUser(user: {
  id: string;
  name: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  handle: string | null;
  pronouns: string | null;
  bio: string | null;
  interests: string[];
  relationshipStatus: string | null;
  location: string | null;
  links: unknown;
  featured: boolean;
  isPro?: boolean | null;
  connectionScore?: number | null;
  totalConnections?: number | null;
  secondDegreeConnections?: number | null;
  profileImage?: string | null;
}): User {
  const links =
    user.links && typeof user.links === "object" && !Array.isArray(user.links)
      ? (user.links as User["links"])
      : {};

  const isPro = getEffectiveIsPro(user);

  return {
    id: user.id,
    name:
      user.name ??
      (user.firstName || user.lastName
        ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim()
        : "Unnamed member"),
    firstName: user.firstName ?? undefined,
    lastName: user.lastName ?? undefined,
    handle: user.handle ?? "pending-handle",
    pronouns: user.pronouns ?? "",
    bio: user.bio ?? "No bio yet.",
    interests: user.interests,
    relationshipStatus: user.relationshipStatus ?? "unspecified",
    location: user.location ?? "Unknown",
    links,
    featured: user.featured || isPro,
    isPro,
    connectionScore: user.connectionScore ?? 0,
    totalConnections: user.totalConnections ?? 0,
    secondDegreeConnections: user.secondDegreeConnections ?? 0,
    profileImage: user.profileImage ?? null,
  };
}

function normalizePost(post: {
  id: string;
  userId: string;
  content: string;
  timestamp: Date;
  tags: string[];
  likes: number;
  comments: number;
}): Post {
  return {
    id: post.id,
    userId: post.userId,
    content: post.content,
    timestamp: formatRelativeTime(post.timestamp),
    tags: post.tags,
    likes: post.likes,
    comments: post.comments,
  };
}

function normalizeRelationship(relationship: {
  id: string;
  user1Id: string;
  user2Id: string;
  type: string;
  note?: string | null;
  isPublic?: boolean;
  publicRequestedBy?: string | null;
}): Relationship {
  const parsedType = parseStoredRelationshipType(
    relationship.type,
    relationship.user1Id,
    relationship.user2Id,
  );
  const claimMeta = composeClaimMeta({
    storedType: relationship.type,
    user1Id: relationship.user1Id,
    user2Id: relationship.user2Id,
    note: relationship.note,
  });

  return {
    id: relationship.id,
    source: relationship.user1Id,
    target: relationship.user2Id,
    type: parsedType.baseType,
    isPublic: relationship.isPublic ?? false,
    publicRequestedBy: relationship.publicRequestedBy ?? null,
    note: claimMeta.status === "active" ? "" : buildClaimMetaNote(claimMeta),
  };
}

type PlaceholderRecord = {
  id: string;
  ownerId: string;
  name: string;
  offerToNameMatch?: boolean;
  email?: string | null;
  phoneNumber?: string | null;
  relationshipType: string;
  note: string | null;
  inviteToken: string | null;
  linkedUserId: string | null;
  claimStatus: string;
  createdAt: Date;
};

type RelationshipPairRecord = {
  user1Id: string;
  user2Id: string;
};

type NormalizableUser = Parameters<typeof normalizeUser>[0];
type UserFindManyFallbackArgs = Omit<
  Prisma.UserFindManyArgs,
  "include" | "omit" | "select"
>;
type UserFindUniqueFallbackArgs = Omit<
  Prisma.UserFindUniqueArgs,
  "include" | "omit" | "select"
>;

function isColumnMissingError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2022"
  );
}

async function findManyUsersWithProfileFallback(
  args: UserFindManyFallbackArgs = {},
): Promise<NormalizableUser[]> {
  try {
    return await prisma.user.findMany({
      ...args,
      select: baseUserSelect,
    });
  } catch (error) {
    if (!isColumnMissingError(error)) {
      throw error;
    }

    return prisma.user.findMany({
      ...args,
      select: legacyUserSelect,
    });
  }
}

async function findUniqueUserWithProfileFallback(
  args: UserFindUniqueFallbackArgs,
): Promise<NormalizableUser | null> {
  try {
    return await prisma.user.findUnique({
      ...args,
      select: baseUserSelect,
    });
  } catch (error) {
    if (!isColumnMissingError(error)) {
      throw error;
    }

    return prisma.user.findUnique({
      ...args,
      select: legacyUserSelect,
    });
  }
}

export async function getMemberDirectoryData(): Promise<{
  users: User[];
  posts: Post[];
  relationships: Relationship[];
}> {
  const usersRaw = await findManyUsersWithProfileFallback({
    orderBy: [{ featured: "desc" }, { createdAt: "asc" }],
  });

  const [posts, relationships] = await Promise.all([
    prisma.post.findMany({ orderBy: { timestamp: "desc" } }),
    prisma.relationship.findMany({
      where: {
        NOT: { type: { startsWith: pendingTypePrefix } },
      },
    }),
  ]);

  return {
    users: usersRaw.map(normalizeUser),
    posts: posts.map(normalizePost),
    relationships: relationships.map(normalizeRelationship),
  };
}

/** Returns only publicly visible approved relationships for the community map. */
export async function getAllRelationships(): Promise<Relationship[]> {
  const relationships = await prisma.relationship.findMany({
    where: {
      NOT: { type: { startsWith: pendingTypePrefix } },
    },
  });
  return relationships.map(normalizeRelationship);
}

// ===== USERS =====

export async function getAllUsers(): Promise<User[]> {
  const users = await findManyUsersWithProfileFallback({
    orderBy: { createdAt: "desc" },
  });
  return users.map(normalizeUser);
}

export async function getUsersByLocation(location: string): Promise<User[]> {
  const users = await findManyUsersWithProfileFallback({
    where: {
      location: {
        equals: location,
        mode: "insensitive",
      },
    },
    orderBy: { createdAt: "desc" },
  });
  return users.map(normalizeUser);
}

export async function getUserById(id: string): Promise<User | null> {
  const user = await findUniqueUserWithProfileFallback({
    where: { id },
  });
  return user ? normalizeUser(user) : null;
}

export async function getUserByHandle(handle: string): Promise<User | null> {
  const user = await findUniqueUserWithProfileFallback({
    where: { handle },
  });
  return user ? normalizeUser(user) : null;
}

export async function getUserByClerkId(clerkId: string): Promise<User | null> {
  const user = await findUniqueUserWithProfileFallback({
    where: { clerkId },
  });
  return user ? normalizeUser(user) : null;
}

export async function createUser(data: {
  clerkId: string;
  email?: string;
  name?: string;
}): Promise<User> {
  const user = await prisma.user.create({
    data: {
      clerkId: data.clerkId,
      email: data.email,
      name: data.name,
    },
    select: baseUserSelect,
  });
  return normalizeUser(user);
}

export async function updateUser(
  id: string,
  data: Partial<Omit<User, "id" | "clerkId">>,
): Promise<User> {
  const user = await prisma.user.update({
    where: { id },
    data: {
      ...data,
      links: data.links,
    },
    select: baseUserSelect,
  });
  return normalizeUser(user);
}

// ===== POSTS =====

export async function getAllPosts(): Promise<Post[]> {
  const posts = await prisma.post.findMany({
    orderBy: { timestamp: "desc" },
  });
  return posts.map(normalizePost);
}

export async function getPostsByUser(userId: string): Promise<Post[]> {
  const posts = await prisma.post.findMany({
    where: { userId },
    orderBy: { timestamp: "desc" },
  });
  return posts.map(normalizePost);
}

export async function getPostsByLocation(location: string): Promise<Post[]> {
  const posts = await prisma.post.findMany({
    where: {
      user: {
        location: {
          equals: location,
          mode: "insensitive",
        },
      },
    },
    orderBy: { timestamp: "desc" },
  });
  return posts.map(normalizePost);
}

export async function createPost(data: {
  userId: string;
  content: string;
  tags?: string[];
}): Promise<Post> {
  const post = await prisma.post.create({
    data: {
      userId: data.userId,
      content: data.content,
      tags: data.tags || [],
    },
  });
  return normalizePost(post);
}

export async function deletePost(id: string): Promise<void> {
  await prisma.post.delete({
    where: { id },
  });
}

// ===== RELATIONSHIPS =====

/** Returns all of a user's relationships (pending + approved, public + private). */
export async function getRelationshipsByUser(
  userId: string,
): Promise<Relationship[]> {
  const relationships = await prisma.relationship.findMany({
    where: {
      OR: [{ user1Id: userId }, { user2Id: userId }],
    },
  });

  const stalePendingRelationships = relationships.filter((relationship) =>
    hasExpiredPendingConfirmation(
      composeClaimMeta({
        storedType: relationship.type,
        user1Id: relationship.user1Id,
        user2Id: relationship.user2Id,
        note: relationship.note,
      }),
    ),
  );

  if (stalePendingRelationships.length > 0) {
    await Promise.all(
      stalePendingRelationships.map((relationship) =>
        prisma.relationship.update({
          where: { id: relationship.id },
          data: {
            note: buildClaimMetaNote({
              ...composeClaimMeta({
                storedType: relationship.type,
                user1Id: relationship.user1Id,
                user2Id: relationship.user2Id,
                note: relationship.note,
              }),
              status: "expired",
            }),
          },
        }),
      ),
    );
  }

  const refreshed = stalePendingRelationships.length
    ? await prisma.relationship.findMany({
        where: {
          OR: [{ user1Id: userId }, { user2Id: userId }],
        },
      })
    : relationships;

  return refreshed.map(normalizeRelationship);
}

/** Returns a user's placeholder nodes that are still awaiting signup or claim. */
export async function getPrivateConnectionsByUser(
  userId: string,
): Promise<PlaceholderPerson[]> {
  let placeholders: PlaceholderRecord[] = [];

  try {
    placeholders = await prisma.placeholderPerson.findMany({
      where: {
        ownerId: userId,
        claimStatus: { in: ["unclaimed", "invited"] },
      },
      orderBy: { createdAt: "desc" },
      select: basePlaceholderSelect,
    });
  } catch (error) {
    if (!isColumnMissingError(error)) {
      throw error;
    }

    // Schema drift fallback while rollout is ahead of DB migrations.
    placeholders = await prisma.placeholderPerson.findMany({
      where: {
        ownerId: userId,
        claimStatus: { in: ["unclaimed", "invited"] },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        ownerId: true,
        name: true,
        relationshipType: true,
        note: true,
        inviteToken: true,
        linkedUserId: true,
        claimStatus: true,
        createdAt: true,
      },
    });
  }

  return placeholders.map((p: PlaceholderRecord) => ({
    id: p.id,
    ownerId: p.ownerId,
    name: p.name,
    offerToNameMatch: p.offerToNameMatch ?? true,
    email: p.email ?? "",
    phoneNumber: p.phoneNumber ?? "",
    relationshipType: p.relationshipType as RelationshipType,
    note: p.note ?? "",
    inviteToken: p.inviteToken,
    linkedUserId: p.linkedUserId,
    claimStatus: p.claimStatus as PlaceholderPerson["claimStatus"],
    createdAt: p.createdAt.toISOString(),
  }));
}

export async function getApprovedConnectionUserIds(
  userId: string,
): Promise<string[]> {
  const relationships = await prisma.relationship.findMany({
    where: {
      OR: [{ user1Id: userId }, { user2Id: userId }],
      NOT: {
        type: {
          startsWith: pendingTypePrefix,
        },
      },
    },
    select: {
      user1Id: true,
      user2Id: true,
    },
  });

  const ids = new Set<string>();
  relationships.forEach((item: RelationshipPairRecord) => {
    if (item.user1Id !== userId) {
      ids.add(item.user1Id);
    }
    if (item.user2Id !== userId) {
      ids.add(item.user2Id);
    }
  });

  return Array.from(ids);
}

export async function createRelationship(data: {
  user1Id: string;
  user2Id: string;
  type: string;
  note?: string;
}): Promise<Relationship> {
  const relationship = await prisma.relationship.create({
    data,
  });
  await recalculateConnectionScoresForUsers([data.user1Id, data.user2Id]);
  return normalizeRelationship(relationship);
}

export async function deleteRelationship(
  user1Id: string,
  user2Id: string,
): Promise<void> {
  await prisma.relationship.deleteMany({
    where: {
      OR: [
        { user1Id, user2Id },
        { user1Id: user2Id, user2Id: user1Id },
      ],
    },
  });
  await recalculateConnectionScoresForUsers([user1Id, user2Id]);
}

// ===== MESSAGES =====

export async function getMessages(
  userId: string,
): Promise<Awaited<ReturnType<typeof prisma.message.findMany>>> {
  const messages = await prisma.message.findMany({
    where: {
      OR: [{ senderId: userId }, { recipientId: userId }],
    },
    orderBy: { createdAt: "desc" },
    include: {
      sender: true,
      recipient: true,
    },
  });
  return messages;
}

export async function createMessage(data: {
  senderId: string;
  recipientId: string;
  content: string;
}): Promise<Awaited<ReturnType<typeof prisma.message.create>>> {
  const message = await prisma.message.create({
    data,
  });
  return message;
}
