import { NextResponse } from "next/server";
import { resolveClerkUserId } from "@/lib/clerk-auth";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, getRequestIp } from "@/lib/rate-limit";
import { consumeSearchForUser } from "@/lib/search-limit";

export async function POST(request: Request) {
  const clerkUserId = await resolveClerkUserId(request);
  if (!clerkUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = getRequestIp(request);
  const rateLimit = await checkRateLimit(`user-search-usage:${clerkUserId}:${ip}`, {
    windowMs: 5 * 60 * 1000,
    maxRequests: 60,
  });

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many search requests. Please try again shortly." },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
      },
    );
  }

  try {
    const currentUser = await prisma.user.findUnique({
      where: { clerkId: clerkUserId },
      select: {
        id: true,
        email: true,
        isPro: true,
        freeSearchesUsed: true,
      },
    });

    if (!currentUser) {
      return NextResponse.json(
        { error: "Profile is still syncing. Please try again shortly." },
        { status: 409 },
      );
    }

    const searchLimit = await consumeSearchForUser(currentUser);
    if (!searchLimit.allowed) {
      return NextResponse.json(
        {
          error: searchLimit.error,
          upgradeRequired: true,
          searchesUsed: searchLimit.searchesUsed,
          searchLimit: searchLimit.searchLimit,
        },
        { status: 402 },
      );
    }

    return NextResponse.json({
      searchesUsed: searchLimit.searchesUsed,
      searchLimit: searchLimit.searchLimit,
    });
  } catch (error) {
    console.error("Search usage update failed", error);
    return NextResponse.json(
      { error: "Search usage update failed." },
      { status: 500 },
    );
  }
}
