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

export async function ensureDbUserByClerkId(clerkId: string) {
  const existing = await prisma.user.findUnique({
    where: { clerkId },
    select: bootstrapUserSelect,
  });

  if (existing) {
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
    { clerkId, name: "New member" },
    { clerkId, name: "New member", handle: handleBase },
    { clerkId, name: "New member", handle: handleBase, email: emailBase },
  ];

  for (const data of attempts) {
    try {
      return await prisma.user.create({
        data,
        select: bootstrapUserSelect,
      });
    } catch (error) {
      const prismaError = error as { code?: string };

      if (prismaError.code === "P2002") {
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

export async function ensureDbUserIdByClerkId(clerkId: string) {
  const user = await ensureDbUserByClerkId(clerkId);
  return user.id;
}
