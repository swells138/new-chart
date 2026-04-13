import { prisma } from "@/lib/prisma";

function makeSeed(clerkId: string) {
  const cleaned = clerkId.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  return (cleaned.slice(-10) || "member");
}

export async function ensureDbUserByClerkId(clerkId: string) {
  const existing = await prisma.user.findUnique({
    where: { clerkId },
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
    phoneNumber?: string;
  }> = [
    { clerkId, name: "New member" },
    { clerkId, name: "New member", handle: handleBase },
    { clerkId, name: "New member", handle: handleBase, email: emailBase },
    { clerkId, name: "New member", handle: handleBase, email: emailBase, phoneNumber: `+1000${nonce}` },
  ];

  for (const data of attempts) {
    try {
      return await prisma.user.create({ data });
    } catch (error) {
      const prismaError = error as { code?: string };

      if (prismaError.code === "P2002") {
        continue;
      }

      throw error;
    }
  }

  const retry = await prisma.user.findUnique({ where: { clerkId } });
  if (retry) {
    return retry;
  }

  throw new Error("Could not provision user profile record.");
}

export async function ensureDbUserIdByClerkId(clerkId: string) {
  const user = await ensureDbUserByClerkId(clerkId);
  return user.id;
}
