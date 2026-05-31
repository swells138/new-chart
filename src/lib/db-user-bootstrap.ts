import { prisma } from "@/lib/prisma";
import { isHardcodedProEmail } from "@/lib/pro-user";

const bootstrapUserSelect = {
  id: true,
  clerkId: true,
  name: true,
  handle: true,
  email: true,
  pronouns: true,
  bio: true,
  location: true,
  interests: true,
  relationshipStatus: true,
  featured: true,
  isPro: true,
  freeSearchesUsed: true,
  connectionScore: true,
  totalConnections: true,
  secondDegreeConnections: true,
  profileImage: true,
  links: true,
  createdAt: true,
  updatedAt: true,
} as const;

const legacyBootstrapUserSelect = {
  id: true,
  clerkId: true,
  name: true,
  handle: true,
  email: true,
  pronouns: true,
  bio: true,
  location: true,
  interests: true,
  relationshipStatus: true,
  featured: true,
  createdAt: true,
  updatedAt: true,
} as const;

type BootstrapUser = {
  id: string;
  clerkId: string;
  name: string | null;
  handle: string | null;
  email: string | null;
  pronouns: string | null;
  bio: string | null;
  location: string | null;
  interests: string[];
  relationshipStatus: string | null;
  featured: boolean;
  isPro?: boolean | null;
  freeSearchesUsed?: number | null;
  connectionScore?: number | null;
  totalConnections?: number | null;
  secondDegreeConnections?: number | null;
  profileImage?: string | null;
  links?: unknown;
  createdAt: Date;
  updatedAt: Date;
};

function makeSeed(clerkId: string) {
  const cleaned = clerkId.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  return (cleaned.slice(-10) || "member");
}

function isPrismaKnownError(error: unknown): error is { code?: string } {
  return typeof error === "object" && error !== null && "code" in error;
}

function isMissingColumnError(error: unknown) {
  return isPrismaKnownError(error) && error.code === "P2022";
}

async function findUserByClerkId(clerkId: string): Promise<BootstrapUser | null> {
  try {
    return await prisma.user.findUnique({
      where: { clerkId },
      select: bootstrapUserSelect,
    });
  } catch (error) {
    if (!isMissingColumnError(error)) {
      throw error;
    }

    return prisma.user.findUnique({
      where: { clerkId },
      select: legacyBootstrapUserSelect,
    });
  }
}

async function findUserById(id: string): Promise<BootstrapUser | null> {
  try {
    return await prisma.user.findUnique({
      where: { id },
      select: bootstrapUserSelect,
    });
  } catch (error) {
    if (!isMissingColumnError(error)) {
      throw error;
    }

    return prisma.user.findUnique({
      where: { id },
      select: legacyBootstrapUserSelect,
    });
  }
}

async function updateUserById(
  id: string,
  data: {
    name?: string | null;
    email?: string | null;
    profileImage?: string;
    isPro?: boolean;
  },
) {
  try {
    await prisma.user.update({
      where: { id },
      data,
      select: { id: true },
    });
  } catch (error) {
    if (!isMissingColumnError(error)) {
      throw error;
    }

    const legacyData = {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.email !== undefined ? { email: data.email } : {}),
    };

    if (Object.keys(legacyData).length > 0) {
      await prisma.user.update({
        where: { id },
        data: legacyData,
        select: { id: true },
      });
    }
  }
}

function makeLegacyUserId(clerkId: string) {
  const seed = makeSeed(clerkId);
  const rand = Math.random().toString(36).slice(2, 10);
  return `c${seed}${Date.now().toString(36)}${rand}`.slice(0, 50);
}

function isPlaceholderDisplayName(value: string | null | undefined) {
  const normalized = (value ?? "").trim().toLowerCase();
  return normalized.length === 0 || normalized === "new member";
}

function toPreferredDisplayName(value: string | null | undefined) {
  const trimmed = (value ?? "").trim();
  return isPlaceholderDisplayName(trimmed) ? null : trimmed;
}

async function insertLegacyCompatibleUser(
  clerkId: string,
  name: string = "New member",
) {
  const id = makeLegacyUserId(clerkId);
  const now = new Date();

  await prisma.$executeRaw`
    INSERT INTO "User" ("id", "clerkId", "name", "createdAt", "updatedAt")
    VALUES (${id}, ${clerkId}, ${name}, ${now}, ${now})
    ON CONFLICT ("clerkId") DO NOTHING
  `;
}

export async function ensureDbUserByClerkId(
  clerkId: string,
  name: string = "New member",
  profileImage?: string | null,
  email?: string | null,
) {
  const existing = await findUserByClerkId(clerkId);

  const preferredName = toPreferredDisplayName(name);

  if (existing) {
    const profileImageUpdate =
      profileImage && existing.profileImage !== profileImage
        ? { profileImage }
        : {};
    const emailUpdate = email && existing.email !== email ? { email } : {};
    const proUpdate =
      isHardcodedProEmail(email ?? existing.email) && !existing.isPro
        ? { isPro: true }
        : {};

    if (preferredName && isPlaceholderDisplayName(existing.name)) {
      await updateUserById(existing.id, {
        name: preferredName,
        ...profileImageUpdate,
        ...emailUpdate,
        ...proUpdate,
      });
      return (await findUserById(existing.id)) ?? existing;
    }

    const userUpdate = { ...profileImageUpdate, ...emailUpdate, ...proUpdate };
    if (Object.keys(userUpdate).length > 0) {
      await updateUserById(existing.id, userUpdate);
      return (await findUserById(existing.id)) ?? existing;
    }

    return existing;
  }

  const seed = makeSeed(clerkId);
  const nonce = Date.now().toString(36).slice(-6);
  const handleBase = `user_${seed}_${nonce}`;
  const emailBase = `${seed}.${nonce}@placeholder.meshylinks.local`;

  const attempts: Array<{
    name: string;
    clerkId: string;
    handle?: string;
    email?: string;
  }> = [
    { clerkId, name: preferredName ?? name, ...(email ? { email } : {}) },
    { clerkId, name: preferredName ?? name },
    { clerkId, name: preferredName ?? name, handle: handleBase },
    {
      clerkId,
      name: preferredName ?? name,
      handle: handleBase,
      email: emailBase,
    },
  ];

  for (const data of attempts) {
    try {
      return await prisma.user.create({
        data: {
          ...data,
          ...(profileImage ? { profileImage } : {}),
          ...(isHardcodedProEmail(email) ? { isPro: true } : {}),
        },
        select: bootstrapUserSelect,
      });
    } catch (error) {
      if (!isPrismaKnownError(error)) {
        throw error;
      }

      if (error.code === "P2002") {
        continue;
      }

      // Schema drift in production (missing newer columns) should still allow bootstrap by clerkId.
      if (error.code === "P2022") {
        await insertLegacyCompatibleUser(clerkId);
        const legacyRetry = await findUserByClerkId(clerkId);

        if (legacyRetry) {
          return legacyRetry;
        }

        continue;
      }

      throw error;
    }
  }

  const retry = await findUserByClerkId(clerkId);
  if (retry) {
    return retry;
  }

  throw new Error("Could not provision user profile record.");
}

export async function ensureDbUserIdByClerkId(
  clerkId: string,
  name: string = "New member",
  profileImage?: string | null,
) {
  const existing = await prisma.user.findUnique({
    where: { clerkId },
    select: { id: true },
  });

  if (existing) {
    return existing.id;
  }

  try {
    const created = await prisma.user.create({
      data: {
        clerkId,
        name,
        ...(profileImage ? { profileImage } : {}),
      },
      select: { id: true },
    });

    return created.id;
  } catch (error) {
    if (!isPrismaKnownError(error)) {
      throw error;
    }

    if (error.code === "P2022") {
      await insertLegacyCompatibleUser(clerkId, name);
    } else if (error.code !== "P2002") {
      throw error;
    }

    const retry = await prisma.user.findUnique({
      where: { clerkId },
      select: { id: true },
    });

    if (retry) {
      return retry.id;
    }

    throw new Error("Could not provision user profile record.");
  }
}
