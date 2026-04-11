/**
 * Database query helpers using Prisma
 *
 * Replace the static JSON imports in data.ts with these dynamic queries
 * as you migrate to the database.
 */

import { prisma } from "./prisma";
import type { User, Post, Relationship } from "@/types/models";

const relationshipTypes: Relationship["type"][] = [
  "friends",
  "married",
  "exes",
  "collaborators",
  "roommates",
  "crushes",
  "mentors",
];

const pendingTypePrefix = "pending::";
const metaPrefix = "[[meta:";
const metaSuffix = "]]";

function parseStoredRelationshipType(
  storedType: string,
  fallbackRequesterId: string,
  fallbackResponderId: string
): {
  status: "approved" | "pending";
  baseType: Relationship["type"];
  requesterId: string;
  responderId: string;
} {
  if (!storedType.startsWith(pendingTypePrefix)) {
    return {
      status: "approved",
      baseType: relationshipTypes.includes(storedType as Relationship["type"])
        ? (storedType as Relationship["type"])
        : "friends",
      requesterId: fallbackRequesterId,
      responderId: fallbackResponderId,
    };
  }

  const [, rawBaseType = "friends", requesterId = fallbackRequesterId, responderId = fallbackResponderId] =
    storedType.split("::");

  return {
    status: "pending",
    baseType: relationshipTypes.includes(rawBaseType as Relationship["type"])
      ? (rawBaseType as Relationship["type"])
      : "friends",
    requesterId,
    responderId,
  };
}

function formatRelativeTime(timestamp: Date) {
  const differenceInMs = Date.now() - timestamp.getTime();
  const differenceInHours = Math.max(1, Math.round(differenceInMs / (1000 * 60 * 60)));

  if (differenceInHours < 24) {
    return `${differenceInHours}h ago`;
  }

  const differenceInDays = Math.round(differenceInHours / 24);
  return `${differenceInDays}d ago`;
}

function formatCalendarDate(timestamp: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(timestamp);
}

function normalizeUser(user: {
  id: string;
  name: string | null;
  handle: string | null;
  pronouns: string | null;
  bio: string | null;
  interests: string[];
  relationshipStatus: string | null;
  location: string | null;
  links: unknown;
  featured: boolean;
}): User {
  const links =
    user.links && typeof user.links === "object" && !Array.isArray(user.links)
      ? (user.links as User["links"])
      : {};

  return {
    id: user.id,
    name: user.name ?? "Unnamed member",
    handle: user.handle ?? "pending-handle",
    pronouns: user.pronouns ?? "",
    bio: user.bio ?? "No bio yet.",
    interests: user.interests,
    relationshipStatus: user.relationshipStatus ?? "unspecified",
    location: user.location ?? "Unknown",
    links,
    featured: user.featured,
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
}): Relationship {
  const parsed = parseStoredRelationshipType(
    relationship.type,
    relationship.user1Id,
    relationship.user2Id
  );

  return {
    id: relationship.id,
    source: relationship.user1Id,
    target: relationship.user2Id,
    type: parsed.baseType,
    note:
      parsed.status === "pending"
        ? `${metaPrefix}${JSON.stringify({
            status: "pending",
            requesterId: parsed.requesterId,
            responderId: parsed.responderId,
          })}${metaSuffix}`
        : "",
  };
}

export async function getMemberDirectoryData(): Promise<{
  users: User[];
  posts: Post[];
  relationships: Relationship[];
}> {
  const [users, posts, relationships] = await Promise.all([
    prisma.user.findMany({ orderBy: [{ featured: "desc" }, { createdAt: "asc" }] }),
    prisma.post.findMany({ orderBy: { timestamp: "desc" } }),
    prisma.relationship.findMany({
      where: {
        NOT: {
          type: {
            startsWith: pendingTypePrefix,
          },
        },
      },
    }),
  ]);

  return {
    users: users.map(normalizeUser),
    posts: posts.map(normalizePost),
    relationships: relationships.map(normalizeRelationship),
  };
}

export async function getAllRelationships(): Promise<Relationship[]> {
  const relationships = await prisma.relationship.findMany({
    where: {
      NOT: {
        type: {
          startsWith: pendingTypePrefix,
        },
      },
    },
  });
  return relationships.map(normalizeRelationship);
}

// ===== USERS =====

export async function getAllUsers(): Promise<User[]> {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
  });
  return users.map(normalizeUser);
}

export async function getUsersByLocation(location: string): Promise<User[]> {
  const users = await prisma.user.findMany({
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
  const user = await prisma.user.findUnique({
    where: { id },
  });
  return user ? normalizeUser(user) : null;
}

export async function getUserByHandle(handle: string): Promise<User | null> {
  const user = await prisma.user.findUnique({
    where: { handle },
  });
  return user ? normalizeUser(user) : null;
}

export async function getUserByClerkId(clerkId: string): Promise<User | null> {
  const user = await prisma.user.findUnique({
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
  });
  return normalizeUser(user);
}

export async function updateUser(
  id: string,
  data: Partial<Omit<User, "id" | "clerkId">>
): Promise<User> {
  const user = await prisma.user.update({
    where: { id },
    data: {
      ...data,
      links: data.links,
    },
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

export async function getRelationshipsByUser(userId: string): Promise<Relationship[]> {
  const relationships = await prisma.relationship.findMany({
    where: {
      OR: [
        { user1Id: userId },
        { user2Id: userId },
      ],
    },
  });
  return relationships.map(normalizeRelationship);
}

export async function getApprovedConnectionUserIds(userId: string): Promise<string[]> {
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
  relationships.forEach((item) => {
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
  return normalizeRelationship(relationship);
}

export async function deleteRelationship(user1Id: string, user2Id: string): Promise<void> {
  await prisma.relationship.deleteMany({
    where: {
      OR: [
        { user1Id, user2Id },
        { user1Id: user2Id, user2Id: user1Id },
      ],
    },
  });
}

// ===== MESSAGES =====

export async function getMessages(
  userId: string
): Promise<Awaited<ReturnType<typeof prisma.message.findMany>>> {
  const messages = await prisma.message.findMany({
    where: {
      OR: [
        { senderId: userId },
        { recipientId: userId },
      ],
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
