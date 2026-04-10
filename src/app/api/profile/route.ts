import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const hasClerkKeys =
  Boolean(process.env.CLERK_SECRET_KEY) &&
  Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

const ALLOWED_PRONOUNS = new Set([
  "She/Her",
  "He/Him",
  "They/Them",
  "She/They",
  "He/They",
  "Any/All",
  "Prefer not to say",
]);

const ALLOWED_LOCATIONS = new Set([
  "California",
  "Florida",
  "New York",
  "Texas",
  "Washington",
  "Austin, TX",
  "Chicago, IL",
  "Los Angeles, CA",
  "Miami, FL",
  "New York City, NY",
  "San Francisco, CA",
  "Seattle, WA",
]);

function normalizeInterests(input: unknown): string[] {
  if (!Array.isArray(input)) return [];

  return input
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .slice(0, 20);
}

function normalizeLinks(input: unknown): { website?: string; social?: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }

  const record = input as Record<string, unknown>;
  const website = typeof record.website === "string" ? record.website.trim() : "";
  const social = typeof record.social === "string" ? record.social.trim() : "";

  return {
    ...(website ? { website } : {}),
    ...(social ? { social } : {}),
  };
}

async function getOrCreateCurrentDbUser(clerkId: string) {
  const existing = await prisma.user.findUnique({
    where: { clerkId },
  });

  if (existing) {
    return existing;
  }

  const clerk = await currentUser();
  const fullName = [clerk?.firstName, clerk?.lastName].filter(Boolean).join(" ").trim();
  const email = clerk?.emailAddresses?.[0]?.emailAddress;

  return prisma.user.create({
    data: {
      clerkId,
      name: fullName || clerk?.username || "New member",
      email,
      handle: clerk?.username || null,
    },
  });
}

function shapeProfile(user: {
  id: string;
  clerkId: string;
  name: string | null;
  handle: string | null;
  pronouns: string | null;
  bio: string | null;
  location: string | null;
  relationshipStatus: string | null;
  interests: string[];
  links: unknown;
  profileImage: string | null;
  email: string | null;
}) {
  return {
    id: user.id,
    clerkId: user.clerkId,
    email: user.email,
    name: user.name ?? "",
    handle: user.handle ?? "",
    pronouns: user.pronouns ?? "",
    bio: user.bio ?? "",
    location: user.location ?? "",
    relationshipStatus: user.relationshipStatus ?? "",
    interests: user.interests,
    links: normalizeLinks(user.links),
    profileImage: user.profileImage ?? "",
  };
}

export async function GET() {
  if (!hasClerkKeys) {
    return NextResponse.json({ error: "Auth is not configured." }, { status: 503 });
  }

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await getOrCreateCurrentDbUser(userId);

  return NextResponse.json({ profile: shapeProfile(user) });
}

export async function PATCH(request: Request) {
  if (!hasClerkKeys) {
    return NextResponse.json({ error: "Auth is not configured." }, { status: 503 });
  }

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = (await request.json()) as {
    name?: unknown;
    handle?: unknown;
    pronouns?: unknown;
    bio?: unknown;
    location?: unknown;
    relationshipStatus?: unknown;
    interests?: unknown;
    links?: unknown;
  };

  const name = typeof payload.name === "string" ? payload.name.trim() : undefined;
  const pronouns = typeof payload.pronouns === "string" ? payload.pronouns.trim() : undefined;
  const bio = typeof payload.bio === "string" ? payload.bio.trim() : undefined;
  const location = typeof payload.location === "string" ? payload.location.trim() : undefined;
  const relationshipStatus =
    typeof payload.relationshipStatus === "string" ? payload.relationshipStatus.trim() : undefined;
  const interests = payload.interests !== undefined ? normalizeInterests(payload.interests) : undefined;
  const links = payload.links !== undefined ? normalizeLinks(payload.links) : undefined;

  if (payload.handle !== undefined) {
    return NextResponse.json({ error: "Username cannot be changed." }, { status: 400 });
  }

  if (pronouns !== undefined && pronouns.length > 0 && !ALLOWED_PRONOUNS.has(pronouns)) {
    return NextResponse.json({ error: "Please select a valid pronouns option." }, { status: 400 });
  }

  if (location !== undefined && location.length > 0 && !ALLOWED_LOCATIONS.has(location)) {
    return NextResponse.json({ error: "Please select a valid location option." }, { status: 400 });
  }

  try {
    await getOrCreateCurrentDbUser(userId);

    const updated = await prisma.user.update({
      where: { clerkId: userId },
      data: {
        ...(name !== undefined ? { name: name || null } : {}),
        ...(pronouns !== undefined ? { pronouns: pronouns || null } : {}),
        ...(bio !== undefined ? { bio: bio || null } : {}),
        ...(location !== undefined ? { location: location || null } : {}),
        ...(relationshipStatus !== undefined
          ? { relationshipStatus: relationshipStatus || null }
          : {}),
        ...(interests !== undefined ? { interests } : {}),
        ...(links !== undefined ? { links } : {}),
      },
    });

    return NextResponse.json({ profile: shapeProfile(updated) });
  } catch (error) {
    console.error("Failed to update profile", error);
    return NextResponse.json({ error: "Failed to update profile." }, { status: 500 });
  }
}
