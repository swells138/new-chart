import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveClerkUserId } from "@/lib/clerk-auth";
import { ensureDbUserByClerkId } from "@/lib/db-user-bootstrap";

const hasClerkKeys =
  Boolean(process.env.CLERK_SECRET_KEY) &&
  Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ||
      process.env.CLERK_PUBLISHABLE_KEY
  );

function mask(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  if (value.length <= 8) {
    return value;
  }

  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function safeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message.slice(0, 220),
    };
  }

  return {
    name: "UnknownError",
    message: "Unknown error",
  };
}

export async function GET(request: Request) {
  const report: Record<string, unknown> = {
    hasClerkKeys,
    hasAuthorizationBearer: (request.headers.get("authorization") ?? "").toLowerCase().startsWith("bearer "),
  };

  try {
    const { userId } = await auth();
    report.authUserId = mask(userId ?? null);
  } catch (error) {
    report.authError = safeError(error);
  }

  try {
    const clerk = await currentUser();
    report.currentUserId = mask(clerk?.id ?? null);
  } catch (error) {
    report.currentUserError = safeError(error);
  }

  let resolvedUserId: string | null = null;
  try {
    resolvedUserId = await resolveClerkUserId(request);
    report.resolvedUserId = mask(resolvedUserId);
  } catch (error) {
    report.resolveError = safeError(error);
  }

  if (resolvedUserId) {
    try {
      const dbUser = await prisma.user.findUnique({
        where: { clerkId: resolvedUserId },
        select: { id: true, clerkId: true },
      });

      report.dbUserExists = Boolean(dbUser);
      report.dbUserId = dbUser?.id ?? null;
    } catch (error) {
      report.dbLookupError = safeError(error);
    }

    const shouldBootstrap = new URL(request.url).searchParams.get("bootstrap") === "1";
    if (shouldBootstrap) {
      try {
        const user = await ensureDbUserByClerkId(resolvedUserId);
        report.bootstrapCreated = true;
        report.bootstrapUserId = user.id;
      } catch (error) {
        report.bootstrapCreated = false;
        report.bootstrapError = safeError(error);
      }
    }
  }

  return NextResponse.json(report);
}
