import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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
  const { searchParams } = new URL(request.url);
  const query = normalizeQuery(searchParams.get("q"));

  if (!query) {
    return NextResponse.json({ users: [] });
  }

  try {
    const users = await prisma.user.findMany({
      where: {
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
