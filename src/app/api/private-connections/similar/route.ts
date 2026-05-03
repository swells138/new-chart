import { NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { resolveClerkUserId } from "@/lib/clerk-auth";
import { findPrivateDuplicateMatches } from "@/lib/private-duplicate-matches";
import { findExistingUserSuggestion } from "@/lib/existing-user-suggestions";

const hasClerkKeys =
  Boolean(process.env.CLERK_SECRET_KEY) &&
  Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ||
      process.env.CLERK_PUBLISHABLE_KEY,
  );

const similarSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    email: z.string().trim().email().max(200).optional().or(z.literal("")),
    phoneNumber: z.string().trim().max(40).optional().or(z.literal("")),
    location: z.string().trim().max(120).optional().or(z.literal("")),
    handle: z.string().trim().max(80).optional().or(z.literal("")),
  })
  .strict();

function getPrismaErrorCode(error: unknown) {
  if (typeof error === "object" && error !== null && "code" in error) {
    const maybeCode = (error as { code?: unknown }).code;
    return typeof maybeCode === "string" ? maybeCode : null;
  }

  return null;
}

async function getOrCreateCurrentDbUserId(clerkId: string) {
  const existing = await prisma.user.findUnique({
    where: { clerkId },
    select: { id: true },
  });

  if (existing) {
    return existing.id;
  }

  let fallbackName = "New member";
  try {
    const clerk = await currentUser();
    const fullName = [clerk?.firstName, clerk?.lastName]
      .filter(Boolean)
      .join(" ")
      .trim();
    fallbackName = fullName || clerk?.username || fallbackName;
  } catch {
    // Bearer-token auth can succeed without a request-bound Clerk session.
  }

  try {
    const created = await prisma.user.create({
      data: {
        clerkId,
        name: fallbackName,
      },
      select: { id: true },
    });

    return created.id;
  } catch (error) {
    const code = getPrismaErrorCode(error);
    if (code === "P2002") {
      const retry = await prisma.user.findUnique({
        where: { clerkId },
        select: { id: true },
      });

      if (retry) {
        return retry.id;
      }
    }

    throw error;
  }
}

async function getAuthenticatedDbUserId(request: Request) {
  if (!hasClerkKeys) {
    return {
      error: NextResponse.json(
        { error: "Auth is not configured." },
        { status: 503 },
      ),
    };
  }
  const userId = await resolveClerkUserId(request);
  if (!userId) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  const dbUserId = await getOrCreateCurrentDbUserId(userId);
  return { dbUserId };
}

export async function POST(request: Request) {
  try {
    const authResult = await getAuthenticatedDbUserId(request);
    if (authResult.error) return authResult.error;
    const currentDbUserId = authResult.dbUserId;

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body." },
        { status: 400 },
      );
    }

    const parsed = similarSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
    }

    const candidates = await prisma.placeholderPerson.findMany({
      where: { ownerId: currentDbUserId },
      select: {
        id: true,
        ownerId: true,
        name: true,
        email: true,
        phoneNumber: true,
        relationshipType: true,
        note: true,
        claimStatus: true,
        createdAt: true,
        linkedUser: {
          select: {
            handle: true,
            location: true,
            email: true,
            phoneNumber: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    const [matches, suggestion] = await Promise.all([
      Promise.resolve(findPrivateDuplicateMatches(parsed.data, candidates)),
      findExistingUserSuggestion(parsed.data, currentDbUserId),
    ]);

    return NextResponse.json({
      matches,
      suggestion,
      checked: true,
    });
  } catch (error) {
    console.error("Failed to check private duplicate connections", error);
    return NextResponse.json(
      { error: "Could not check for similar people right now." },
      { status: 500 },
    );
  }
}
