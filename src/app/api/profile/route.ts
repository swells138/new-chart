import { currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, getRequestIp } from "@/lib/rate-limit";
import { resolveClerkUserId } from "@/lib/clerk-auth";

const hasClerkKeys =
  Boolean(process.env.CLERK_SECRET_KEY) &&
  Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ||
      process.env.CLERK_PUBLISHABLE_KEY
  );

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

const profilePatchSchema = z
  .object({
    name: z.string().trim().max(120).optional(),
    handle: z.string().trim().max(120).optional(),
    pronouns: z.string().trim().max(50).optional(),
    bio: z.string().trim().max(1000).optional(),
    location: z.string().trim().max(120).optional(),
    relationshipStatus: z.string().trim().max(120).optional(),
    interests: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
    links: z
      .object({
        website: z.string().trim().max(300).optional(),
        social: z.string().trim().max(300).optional(),
      })
      .optional(),
  })
  .strict();

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
  const phoneNumber = clerk?.phoneNumbers?.[0]?.phoneNumber;

  return prisma.user.create({
    data: {
      clerkId,
      name: fullName || clerk?.username || "New member",
      email,
      phoneNumber,
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
  phoneNumber: string | null;
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
    phoneNumber: user.phoneNumber ?? "",
  };
}

export async function GET(request: Request) {
  if (!hasClerkKeys) {
    return NextResponse.json({ error: "Auth is not configured." }, { status: 503 });
  }

  const userId = await resolveClerkUserId(request);
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

  const userId = await resolveClerkUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = getRequestIp(request);
  const rateLimit = await checkRateLimit(`profile-patch:${userId}:${ip}`, {
    windowMs: 5 * 60 * 1000,
    maxRequests: 30,
  });

  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: "Too many profile update attempts. Please try again shortly.",
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateLimit.retryAfterSeconds),
        },
      }
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = profilePatchSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid profile payload." }, { status: 400 });
  }

  const { name, pronouns, bio, location, relationshipStatus, interests, links, handle } =
    parsed.data;

  if (handle !== undefined) {
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
