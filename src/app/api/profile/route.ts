import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, getRequestIp } from "@/lib/rate-limit";
import { resolveClerkUserId } from "@/lib/clerk-auth";
import { ensureDbUserByClerkId } from "@/lib/db-user-bootstrap";

const profileSafeSelect = {
  id: true,
  clerkId: true,
  name: true,
  firstName: true,
  lastName: true,
  handle: true,
  pronouns: true,
  bio: true,
  location: true,
  relationshipStatus: true,
  interests: true,
  links: true,
  profileImage: true,
  isPro: true,
  email: true,
  phoneNumber: true,
} as const;

const hasClerkKeys =
  Boolean(process.env.CLERK_SECRET_KEY) &&
  Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ||
    process.env.CLERK_PUBLISHABLE_KEY,
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

const USERNAME_PATTERN = /^[a-zA-Z0-9._-]{3,30}$/;

const profilePatchSchema = z
  .object({
    name: z.string().trim().max(120).optional(),
    firstName: z.string().trim().max(120).optional(),
    lastName: z.string().trim().max(120).optional(),
    profileImage: z.string().trim().max(1000).optional(),
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
  const website =
    typeof record.website === "string" ? record.website.trim() : "";
  const social = typeof record.social === "string" ? record.social.trim() : "";

  return {
    ...(website ? { website } : {}),
    ...(social ? { social } : {}),
  };
}

async function getOrCreateCurrentDbUser(clerkId: string) {
  return ensureDbUserByClerkId(clerkId);
}

function shapeProfile(user: {
  id: string;
  clerkId: string;
  name: string | null;
  firstName?: string | null;
  lastName?: string | null;
  handle: string | null;
  pronouns: string | null;
  bio: string | null;
  location: string | null;
  relationshipStatus: string | null;
  interests: string[];
  links: unknown;
  profileImage: string | null;
  isPro?: boolean | null;
  email: string | null;
  phoneNumber?: string | null;
}) {
  return {
    id: user.id,
    clerkId: user.clerkId,
    email: user.email,
    name: user.name ?? "",
    firstName: user.firstName ?? "",
    lastName: user.lastName ?? "",
    handle: user.handle ?? "",
    pronouns: user.pronouns ?? "",
    bio: user.bio ?? "",
    location: user.location ?? "",
    relationshipStatus: user.relationshipStatus ?? "",
    interests: user.interests,
    links: normalizeLinks(user.links),
    profileImage: user.profileImage ?? "",
    isPro: Boolean(user.isPro),
    phoneNumber: user.phoneNumber ?? "",
  };
}

export async function GET(request: Request) {
  if (!hasClerkKeys) {
    return NextResponse.json(
      { error: "Auth is not configured." },
      { status: 503 },
    );
  }

  const userId = await resolveClerkUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const user = await getOrCreateCurrentDbUser(userId);
    return NextResponse.json({ profile: shapeProfile(user) });
  } catch (error) {
    console.error("Failed to load profile", error);
    return NextResponse.json(
      { error: "Failed to load profile." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  if (!hasClerkKeys) {
    return NextResponse.json(
      { error: "Auth is not configured." },
      { status: 503 },
    );
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
      },
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
    return NextResponse.json(
      { error: "Invalid profile payload." },
      { status: 400 },
    );
  }

  const {
    name,
    firstName,
    lastName,
    profileImage,
    pronouns,
    bio,
    location,
    relationshipStatus,
    interests,
    links,
    handle,
  } = parsed.data;

  if (
    pronouns !== undefined &&
    pronouns.length > 0 &&
    !ALLOWED_PRONOUNS.has(pronouns)
  ) {
    return NextResponse.json(
      { error: "Please select a valid pronouns option." },
      { status: 400 },
    );
  }

  try {
    const currentUser = await getOrCreateCurrentDbUser(userId);

    const handleUpdate: { handle?: string | null } = {};
    if (handle !== undefined) {
      const normalizedHandle = handle.trim();

      if (!normalizedHandle) {
        return NextResponse.json(
          { error: "Username is required." },
          { status: 400 },
        );
      }

      if (currentUser.handle) {
        return NextResponse.json(
          { error: "Username cannot be changed." },
          { status: 400 },
        );
      }

      if (!USERNAME_PATTERN.test(normalizedHandle)) {
        return NextResponse.json(
          {
            error:
              "Username must be 3-30 characters and only include letters, numbers, dots, underscores, or dashes.",
          },
          { status: 400 },
        );
      }

      const existingHandle = await prisma.user.findFirst({
        where: {
          handle: { equals: normalizedHandle, mode: "insensitive" },
          clerkId: { not: userId },
        },
        select: { id: true },
      });

      if (existingHandle) {
        return NextResponse.json(
          { error: "Username is already taken." },
          { status: 409 },
        );
      }

      handleUpdate.handle = normalizedHandle;
    }

    const updated = await prisma.user.update({
      where: { clerkId: userId },
      data: {
        ...handleUpdate,
        ...(name !== undefined ? { name: name || null } : {}),
        ...(firstName !== undefined ? { firstName: firstName || null } : {}),
        ...(lastName !== undefined ? { lastName: lastName || null } : {}),
        ...(profileImage !== undefined
          ? { profileImage: profileImage || null }
          : {}),
        ...(pronouns !== undefined ? { pronouns: pronouns || null } : {}),
        ...(bio !== undefined ? { bio: bio || null } : {}),
        ...(location !== undefined ? { location: location || null } : {}),
        ...(relationshipStatus !== undefined
          ? { relationshipStatus: relationshipStatus || null }
          : {}),
        ...(interests !== undefined ? { interests } : {}),
        ...(links !== undefined ? { links } : {}),
      },
      select: profileSafeSelect,
    });

    return NextResponse.json({ profile: shapeProfile(updated) });
  } catch (error) {
    console.error("Failed to update profile", error);
    return NextResponse.json(
      { error: "Failed to update profile." },
      { status: 500 },
    );
  }
}
