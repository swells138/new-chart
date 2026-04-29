import { prisma } from "@/lib/prisma";

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
  profileImage: true,
  links: true,
  createdAt: true,
  updatedAt: true,
} as const;

function makeSeed(clerkId: string) {
  const cleaned = clerkId.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  return (cleaned.slice(-10) || "member");
}

function isPrismaKnownError(error: unknown): error is { code?: string } {
  return typeof error === "object" && error !== null && "code" in error;
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

async function insertLegacyCompatibleUser(clerkId: string, name: string = "New member") {
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
) {
  const existing = await prisma.user.findUnique({
    where: { clerkId },
    select: bootstrapUserSelect,
  });

  const preferredName = toPreferredDisplayName(name);

  if (existing) {
    const profileImageUpdate =
      profileImage && existing.profileImage !== profileImage
        ? { profileImage }
        : {};

    if (preferredName && isPlaceholderDisplayName(existing.name)) {
      return prisma.user.update({
        where: { id: existing.id },
        data: { name: preferredName, ...profileImageUpdate },
        select: bootstrapUserSelect,
      });
    }

    if (Object.keys(profileImageUpdate).length > 0) {
      return prisma.user.update({
        where: { id: existing.id },
        data: profileImageUpdate,
        select: bootstrapUserSelect,
      });
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
    { clerkId, name: preferredName ?? name },
    { clerkId, name: preferredName ?? name, handle: handleBase },
    { clerkId, name: preferredName ?? name, handle: handleBase, email: emailBase },
  ];

  for (const data of attempts) {
    try {
      return await prisma.user.create({
        data: {
          ...data,
          ...(profileImage ? { profileImage } : {}),
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
        const legacyRetry = await prisma.user.findUnique({
          where: { clerkId },
          select: bootstrapUserSelect,
        });

        if (legacyRetry) {
          return legacyRetry;
        }

        continue;
      }

      throw error;
    }
  }

  const retry = await prisma.user.findUnique({
    where: { clerkId },
    select: bootstrapUserSelect,
  });
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
  const user = await ensureDbUserByClerkId(clerkId, name, profileImage);
  return user.id;
}
