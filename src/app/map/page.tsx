import { auth, currentUser } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { RelationshipMap } from "@/components/map/relationship-map";
import { SectionHeader } from "@/components/ui/section-header";
import { prisma } from "@/lib/prisma";
import { getAllRelationships, getAllUsers, getPrivateConnectionsByUser, getRelationshipsByUser } from "@/lib/prisma-queries";

export const dynamic = "force-dynamic";

const hasClerkKeys =
  Boolean(process.env.CLERK_SECRET_KEY) &&
  Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ||
      process.env.CLERK_PUBLISHABLE_KEY
  );

async function resolveClerkUserId() {
  try {
    const { userId } = await auth();
    if (userId) {
      return userId;
    }
  } catch {
    // Fall through to currentUser() when auth() cannot resolve a session.
  }

  try {
    const clerk = await currentUser();
    return clerk?.id ?? null;
  } catch {
    return null;
  }
}

export default async function MapPage() {
  let currentUserDbId: string | null = null;
  const cookieStore = await cookies();
  const hasSessionCookie = cookieStore.has("__session");
  let sessionSignedIn = hasSessionCookie;

  if (hasClerkKeys) {
    try {
      const userId = await resolveClerkUserId();
      sessionSignedIn = Boolean(userId) || hasSessionCookie;

      if (userId) {
        const clerk = await currentUser();
        const fullName = [clerk?.firstName, clerk?.lastName].filter(Boolean).join(" ").trim();
        const profileImage = clerk?.imageUrl || null;
        const existing = await prisma.user.findUnique({
          where: { clerkId: userId },
          select: { id: true, profileImage: true },
        });

        if (existing) {
          currentUserDbId = existing.id;
          if (profileImage && existing.profileImage !== profileImage) {
            await prisma.user.update({
              where: { id: existing.id },
              data: { profileImage },
              select: { id: true },
            });
          }
        } else {
          try {
            const created = await prisma.user.create({
              data: {
                clerkId: userId,
                name: fullName || clerk?.username || "New member",
                profileImage,
              },
              select: { id: true },
            });

            currentUserDbId = created.id;
          } catch (error) {
            const prismaError = error as { code?: string };

            if (prismaError.code === "P2002") {
              const retry = await prisma.user.findUnique({
                where: { clerkId: userId },
                select: { id: true },
              });

              if (retry) {
                currentUserDbId = retry.id;
              }
            } else {
              throw error;
            }
          }
        }
      }
    } catch (error) {
      console.error("Map page failed to initialize authenticated user", error);
      currentUserDbId = null;
      sessionSignedIn = hasSessionCookie;
    }
  }

  let allUsers: Awaited<ReturnType<typeof getAllUsers>> = [];
  let relationships: Awaited<ReturnType<typeof getAllRelationships>> = [];

  try {
    [allUsers, relationships] = await Promise.all([getAllUsers(), getAllRelationships()]);
  } catch (error) {
    console.error("Map page failed to load base network data", error);
  }

  const users = allUsers;
  let userConnections: typeof relationships = [];
  let privatePlaceholders = [] as Awaited<ReturnType<typeof getPrivateConnectionsByUser>>;

  if (currentUserDbId) {
    try {
      [userConnections, privatePlaceholders] = await Promise.all([
        getRelationshipsByUser(currentUserDbId),
        getPrivateConnectionsByUser(currentUserDbId),
      ]);
    } catch (error) {
      console.error("Map page failed to load user-scoped network data", error);
      userConnections = [];
      privatePlaceholders = [];
    }
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL
      ? process.env.VERCEL_URL.startsWith("http")
        ? process.env.VERCEL_URL
        : `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000");

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Your Network"
        subtitle="Manage direct connections, verify pending matches, and explore the confirmed network around you."
      />
      <div className="rounded-xl border border-[var(--border-soft)] bg-black/[0.03] px-4 py-3 text-xs text-black/70 dark:bg-white/[0.04] dark:text-white/70">
        Disclaimer: all connections were created and verified by both parties.
      </div>
      <RelationshipMap
        users={users}
        relationships={relationships}
        currentUserId={currentUserDbId}
        isSignedIn={sessionSignedIn}
        userConnections={userConnections}
        privatePlaceholders={privatePlaceholders}
        baseUrl={baseUrl}
      />
    </div>
  );
}
