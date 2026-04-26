import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveClerkUserId } from "@/lib/clerk-auth";
import { ensureDbUserIdByClerkId } from "@/lib/db-user-bootstrap";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, getRequestIp } from "@/lib/rate-limit";
import { createModerationReport } from "@/lib/moderation/reports";

const hasClerkKeys =
  Boolean(process.env.CLERK_SECRET_KEY) &&
  Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ||
      process.env.CLERK_PUBLISHABLE_KEY,
  );

const reportSchema = z
  .object({
    nodeId: z.string().trim().min(1).max(100),
    reason: z.string().trim().max(300).optional(),
  })
  .strict();

async function getAuthenticatedDbUserId(request: Request) {
  if (!hasClerkKeys) {
    return {
      error: NextResponse.json(
        { error: "Auth is not configured." },
        { status: 503 },
      ),
    };
  }

  const clerkId = await resolveClerkUserId(request);
  if (!clerkId) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const dbUserId = await ensureDbUserIdByClerkId(clerkId);
  return { dbUserId };
}

export async function POST(request: Request) {
  try {
    const authResult = await getAuthenticatedDbUserId(request);
    if (authResult.error) {
      return authResult.error;
    }

    const reporterUserId = authResult.dbUserId;
    const ip = getRequestIp(request);

    const rateLimit = await checkRateLimit(
      `relationships-report:${reporterUserId}:${ip}`,
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

    const { nodeId, reason } = parsed.data;

    if (nodeId === reporterUserId) {
      return NextResponse.json(
        { error: "You cannot report your own node." },
        { status: 400 },
      );
    }

    const node = await prisma.user.findUnique({
      where: { id: nodeId },
      select: { id: true, name: true, handle: true },
    });

    if (!node) {
      return NextResponse.json({ error: "Node not found." }, { status: 404 });
    }

    const reporter = await prisma.user.findUnique({
      where: { id: reporterUserId },
      select: { name: true, handle: true },
    });

    const reporterLabel = reporter?.name || reporter?.handle || null;
    const targetLabel = node.name || node.handle || node.id;

    await createModerationReport({
      kind: "public-node",
      targetId: nodeId,
      targetLabel,
      reporterUserId,
      reporterLabel,
      reason: reason ?? null,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to submit public node report", error);
    return NextResponse.json(
      { error: "Could not submit report right now." },
      { status: 500 },
    );
  }
}
