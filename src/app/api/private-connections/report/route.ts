import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { resolveClerkUserId } from "@/lib/clerk-auth";
import { checkRateLimit, getRequestIp } from "@/lib/rate-limit";

const hasClerkKeys =
  Boolean(process.env.CLERK_SECRET_KEY) &&
  Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ||
      process.env.CLERK_PUBLISHABLE_KEY,
  );

const reportSchema = z
  .object({
    id: z.string().trim().min(1).max(100),
    reason: z.string().trim().max(300).optional(),
  })
  .strict();

function getPrismaErrorCode(error: unknown) {
  if (typeof error === "object" && error !== null && "code" in error) {
    const maybeCode = (error as { code?: unknown }).code;
    return typeof maybeCode === "string" ? maybeCode : null;
  }

  return null;
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

  const dbUser = await prisma.user.findUnique({
    where: { clerkId: userId },
    select: { id: true },
  });

  if (!dbUser) {
    return {
      error: NextResponse.json(
        { error: "Profile not ready yet. Reload and try again." },
        { status: 409 },
      ),
    };
  }

  return { dbUserId: dbUser.id };
}

export async function POST(request: Request) {
  try {
    const authResult = await getAuthenticatedDbUserId(request);
    if (authResult.error) return authResult.error;
    const currentDbUserId = authResult.dbUserId;

    const ip = getRequestIp(request);
    const rateLimit = await checkRateLimit(
      `private-connections-report:${currentDbUserId}:${ip}`,
      {
        windowMs: 5 * 60 * 1000,
        maxRequests: 20,
      },
    );
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many reports. Please slow down." },
        {
          status: 429,
          headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
        },
      );
    }

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const parsed = reportSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
    }

    const { id, reason } = parsed.data;

    const existing = await prisma.placeholderPerson.findUnique({
      where: { id },
      select: { id: true, ownerId: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }

    let canReport = existing.ownerId === currentDbUserId;
    if (!canReport) {
      try {
        const withLinkedUser = await prisma.placeholderPerson.findUnique({
          where: { id },
          select: { linkedUserId: true },
        });
        canReport = withLinkedUser?.linkedUserId === currentDbUserId;
      } catch (permissionError) {
        const code = getPrismaErrorCode(permissionError);
        if (code !== "P2022" && code !== "P2021") {
          throw permissionError;
        }
      }
    }

    if (!canReport) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    // Persisting reports is a follow-up; log now so reports are captured server-side.
    console.warn("Private node report submitted", {
      placeholderId: id,
      reporterUserId: currentDbUserId,
      reason: reason ?? null,
      createdAt: new Date().toISOString(),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to submit private node report", error);
    return NextResponse.json(
      { error: "Could not submit report right now." },
      { status: 500 },
    );
  }
}
