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

type ApprovalStatus = "approved" | "pending";

const metaPrefix = "[[meta:";
const metaSuffix = "]]";

interface RelationshipMeta {
  status: ApprovalStatus;
  requesterId: string;
  responderId: string;
}

function parseRelationshipNote(input: string | null | undefined): {
  meta: RelationshipMeta | null;
  note: string;
} {
  const raw = input ?? "";

  if (!raw.startsWith(metaPrefix)) {
    return { meta: null, note: raw.trim() };
  }

  const endIndex = raw.indexOf(metaSuffix);
  if (endIndex === -1) {
    return { meta: null, note: raw.trim() };
  }

  const metadataText = raw.slice(metaPrefix.length, endIndex);
  const note = raw.slice(endIndex + metaSuffix.length).trim();

  try {
    const parsed = JSON.parse(metadataText) as Partial<RelationshipMeta>;
    if (
      (parsed.status === "approved" || parsed.status === "pending") &&
      typeof parsed.requesterId === "string" &&
      typeof parsed.responderId === "string"
    ) {
      return {
        meta: {
          status: parsed.status,
          requesterId: parsed.requesterId,
          responderId: parsed.responderId,
        },
        note,
      };
    }
  } catch {
    return { meta: null, note: raw.trim() };
  }

  return { meta: null, note: raw.trim() };
}

function buildRelationshipNote(meta: RelationshipMeta, note: string) {
  const cleanNote = note.trim();
  return `${metaPrefix}${JSON.stringify(meta)}${metaSuffix}${cleanNote ? ` ${cleanNote}` : ""}`;
}

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

  try {
    const created = await prisma.user.create({
      data: {
        clerkId,
        name: fullName || clerk?.username || "New member",
      },
      select: { id: true },
    });

    return created.id;
  } catch (error) {
    const prismaError = error as { code?: string };

    if (prismaError.code === "P2002") {
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
  const requesterId = currentDbUserId;
  const responderId = source === currentDbUserId ? target : source;

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
        note: buildRelationshipNote(
          {
            status: "pending",
            requesterId,
            responderId,
          },
          note
        ),
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
    action?: unknown;
  };

  const id = typeof payload.id === "string" ? payload.id.trim() : "";
  const type = typeof payload.type === "string" ? payload.type.trim() : "";
  const note = typeof payload.note === "string" ? payload.note.trim() : undefined;
  const action = typeof payload.action === "string" ? payload.action.trim() : "";

  if (!id) {
    return NextResponse.json({ error: "A relationship id is required." }, { status: 400 });
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

  const parsed = parseRelationshipNote(existing.note);
  const meta =
    parsed.meta ??
    ({
      status: "approved",
      requesterId: existing.user1Id,
      responderId: existing.user2Id,
    } as RelationshipMeta);

  if (meta.status === "pending") {
    if (action === "approve") {
      if (currentDbUserId !== meta.responderId) {
        return NextResponse.json(
          { error: "Only the invited user can approve this connection." },
          { status: 403 }
        );
      }

      const nextType = type || existing.type;
      if (!relationshipTypes.includes(nextType as RelationshipType)) {
        return NextResponse.json({ error: "Choose a valid relationship type." }, { status: 400 });
      }

      try {
        const updated = await prisma.relationship.update({
          where: { id },
          data: {
            type: nextType,
            note: buildRelationshipNote(
              {
                ...meta,
                status: "approved",
              },
              note ?? parsed.note
            ),
          },
        });

        return NextResponse.json({ relationship: normalizeRelationship(updated) });
      } catch (error) {
        console.error("Failed to approve relationship", error);
        return NextResponse.json({ error: "Failed to approve relationship." }, { status: 500 });
      }
    }

    if (action === "reject") {
      if (currentDbUserId !== meta.responderId && currentDbUserId !== meta.requesterId) {
        return NextResponse.json(
          { error: "You cannot decline this connection request." },
          { status: 403 }
        );
      }

      await prisma.relationship.delete({ where: { id } });
      return NextResponse.json({ deleted: true, id });
    }

    return NextResponse.json(
      { error: "Pending connections must be approved or declined." },
      { status: 400 }
    );
  }

  const nextType = type || existing.type;
  if (!relationshipTypes.includes(nextType as RelationshipType)) {
    return NextResponse.json({ error: "Choose a valid relationship type." }, { status: 400 });
  }

  try {
    const updated = await prisma.relationship.update({
      where: { id },
      data: {
        type: nextType,
        ...(note !== undefined ? { note: buildRelationshipNote(meta, note) } : {}),
      },
    });

    return NextResponse.json({ relationship: normalizeRelationship(updated) });
  } catch (error) {
    console.error("Failed to update relationship", error);
    return NextResponse.json({ error: "Failed to update relationship." }, { status: 500 });
  }
}