import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { RelationshipType } from "@/types/models";

const hasClerkKeys =
  Boolean(process.env.CLERK_SECRET_KEY) &&
  Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

const relationshipTypes: RelationshipType[] = [
  "friends",
  "married",
  "exes",
  "collaborators",
  "roommates",
  "crushes",
  "mentors",
];

function normalizeRelationship(relationship: {
  id: string;
  user1Id: string;
  user2Id: string;
  type: string;
  note?: string | null;
}) {
  return {
    id: relationship.id,
    source: relationship.user1Id,
    target: relationship.user2Id,
    type: relationship.type as RelationshipType,
    note: relationship.note ?? "",
  };
}

async function getOrCreateCurrentDbUserId(clerkId: string) {
  const existing = await prisma.user.findUnique({
    where: { clerkId },
    select: { id: true },
  });

  if (existing) {
    return existing.id;
  }

  const clerk = await currentUser();
  const fullName = [clerk?.firstName, clerk?.lastName].filter(Boolean).join(" ").trim();
  const email = clerk?.emailAddresses?.[0]?.emailAddress;

  const created = await prisma.user.create({
    data: {
      clerkId,
      name: fullName || clerk?.username || "New member",
      email,
      handle: clerk?.username || null,
    },
    select: { id: true },
  });

  return created.id;
}

async function getAuthenticatedDbUserId() {
  if (!hasClerkKeys) {
    return { error: NextResponse.json({ error: "Auth is not configured." }, { status: 503 }) };
  }

  const { userId } = await auth();
  if (!userId) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const dbUserId = await getOrCreateCurrentDbUserId(userId);
  return { dbUserId };
}

export async function POST(request: Request) {
  const authResult = await getAuthenticatedDbUserId();
  if (authResult.error) {
    return authResult.error;
  }

  const currentDbUserId = authResult.dbUserId;

  const payload = (await request.json()) as {
    source?: unknown;
    target?: unknown;
    type?: unknown;
    note?: unknown;
  };

  const source = typeof payload.source === "string" ? payload.source.trim() : "";
  const target = typeof payload.target === "string" ? payload.target.trim() : "";
  const type = typeof payload.type === "string" ? payload.type.trim() : "";
  const note = typeof payload.note === "string" ? payload.note.trim() : "";

  if (!source || !target) {
    return NextResponse.json({ error: "A source and target node are required." }, { status: 400 });
  }

  if (source === target) {
    return NextResponse.json({ error: "A user cannot connect to themselves." }, { status: 400 });
  }

  if (source !== currentDbUserId && target !== currentDbUserId) {
    return NextResponse.json(
      { error: "You can only create connections that include your own profile." },
      { status: 403 }
    );
  }

  if (!relationshipTypes.includes(type as RelationshipType)) {
    return NextResponse.json({ error: "Choose a valid relationship type." }, { status: 400 });
  }

  const [user1Id, user2Id] = [source, target].sort();

  const users = await prisma.user.findMany({
    where: {
      id: { in: [user1Id, user2Id] },
    },
    select: { id: true },
  });

  if (users.length !== 2) {
    return NextResponse.json({ error: "Both nodes must reference existing users." }, { status: 404 });
  }

  const existing = await prisma.relationship.findFirst({
    where: {
      OR: [
        { user1Id, user2Id },
        { user1Id: user2Id, user2Id: user1Id },
      ],
    },
  });

  if (existing) {
    return NextResponse.json({ error: "These users are already connected." }, { status: 409 });
  }

  try {
    const relationship = await prisma.relationship.create({
      data: {
        user1Id,
        user2Id,
        type,
        ...(note ? { note } : {}),
      },
    });

    return NextResponse.json({ relationship: normalizeRelationship(relationship) }, { status: 201 });
  } catch (error) {
    const prismaError = error as { code?: string };

    if (prismaError.code === "P2002") {
      return NextResponse.json({ error: "These users are already connected." }, { status: 409 });
    }

    console.error("Failed to create relationship", error);
    return NextResponse.json({ error: "Failed to create relationship." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const authResult = await getAuthenticatedDbUserId();
  if (authResult.error) {
    return authResult.error;
  }

  const currentDbUserId = authResult.dbUserId;

  const payload = (await request.json()) as {
    id?: unknown;
    type?: unknown;
    note?: unknown;
  };

  const id = typeof payload.id === "string" ? payload.id.trim() : "";
  const type = typeof payload.type === "string" ? payload.type.trim() : "";
  const note = typeof payload.note === "string" ? payload.note.trim() : undefined;

  if (!id) {
    return NextResponse.json({ error: "A relationship id is required." }, { status: 400 });
  }

  if (!type || !relationshipTypes.includes(type as RelationshipType)) {
    return NextResponse.json({ error: "Choose a valid relationship type." }, { status: 400 });
  }

  const existing = await prisma.relationship.findUnique({
    where: { id },
  });

  if (!existing) {
    return NextResponse.json({ error: "Relationship not found." }, { status: 404 });
  }

  if (existing.user1Id !== currentDbUserId && existing.user2Id !== currentDbUserId) {
    return NextResponse.json(
      { error: "You can only edit connections that include your own profile." },
      { status: 403 }
    );
  }

  try {
    const updated = await prisma.relationship.update({
      where: { id },
      data: {
        type,
        ...(note !== undefined ? { note } : {}),
      },
    });

    return NextResponse.json({ relationship: normalizeRelationship(updated) });
  } catch (error) {
    console.error("Failed to update relationship", error);
    return NextResponse.json({ error: "Failed to update relationship." }, { status: 500 });
  }
}