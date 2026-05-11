import { NextResponse } from "next/server";
import { resolveClerkUserId } from "@/lib/clerk-auth";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, getRequestIp } from "@/lib/rate-limit";

const MAX_RESULTS = 8;

function normalizeQuery(input: string | null) {
  return (input ?? "").trim().replace(/^@+/, "").slice(0, 80);
}

function shapeSearchResult(user: {
  id: string;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  handle: string | null;
  location: string | null;
  profileImage: string | null;
  featured: boolean;
}) {
  const fallbackName =
    [user.firstName, user.lastName].filter(Boolean).join(" ").trim() ||
    user.handle ||
    "Unnamed member";

  return {
    id: user.id,
    name: user.name ?? fallbackName,
    handle: user.handle ?? "",
    location: user.location ?? "",
    profileImage: user.profileImage,
    featured: user.featured,
  };
}

export async function GET(request: Request) {
  const clerkUserId = await resolveClerkUserId(request);
  if (!clerkUserId) {
    return NextResponse.json({ error: "Unauthorized", users: [] }, { status: 401 });
  }

  const ip = getRequestIp(request);
  const rateLimit = await checkRateLimit(`user-search:${clerkUserId}:${ip}`, {
    windowMs: 5 * 60 * 1000,
    maxRequests: 60,
  });

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many search requests. Please try again shortly.", users: [] },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
      },
    );
  }

  const { searchParams } = new URL(request.url);
  const query = normalizeQuery(searchParams.get("q"));

  if (query.length < 2) {
    return NextResponse.json({ users: [] });
  }

  try {
    const currentUser = await prisma.user.findUnique({
      where: { clerkId: clerkUserId },
      select: { id: true },
    });
    const users = await prisma.user.findMany({
      where: {
        id: currentUser?.id ? { not: currentUser.id } : undefined,
        OR: [
          { name: { contains: query, mode: "insensitive" } },
          { firstName: { contains: query, mode: "insensitive" } },
          { lastName: { contains: query, mode: "insensitive" } },
          { handle: { contains: query, mode: "insensitive" } },
        ],
      },
      orderBy: [
        { featured: "desc" },
        { connectionScore: "desc" },
        { name: "asc" },
      ],
      take: MAX_RESULTS,
      select: {
        id: true,
        name: true,
        firstName: true,
        lastName: true,
        handle: true,
        location: true,
        profileImage: true,
        featured: true,
      },
    });

    return NextResponse.json({ users: users.map(shapeSearchResult) });
  } catch (error) {
    console.error("User search failed", error);
    return NextResponse.json(
      { error: "User search failed.", users: [] },
      { status: 500 },
    );
  }
}
