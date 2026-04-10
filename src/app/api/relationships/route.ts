import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { RelationshipType } from "@/types/models";

const relationshipTypes: RelationshipType[] = [
  "friends",
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

export async function POST(request: Request) {
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