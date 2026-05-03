import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveClerkUserId } from "@/lib/clerk-auth";
import { ensureDbUserIdByClerkId } from "@/lib/db-user-bootstrap";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, getRequestIp } from "@/lib/rate-limit";
import { getActiveUserLockMessage } from "@/lib/moderation/locks";
import type { PrivateMixedConnectionEdge, RelationshipType } from "@/types/models";

const hasClerkKeys =
  Boolean(process.env.CLERK_SECRET_KEY) &&
  Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ||
      process.env.CLERK_PUBLISHABLE_KEY,
  );

const relationshipTypeValues = [
  "Talking",
  "Dating",
  "Situationship",
  "Exes",
  "Married",
  "Sneaky Link",
  "Friends",
  "Lovers",
  "One Night Stand",
  "complicated",
  "FWB",
] as const;

const pendingTypePrefix = "pending::";

const createSchema = z
  .object({
    placeholderId: z.string().trim().min(1).max(100),
    userId: z.string().trim().min(1).max(100),
    relationshipType: z.enum(relationshipTypeValues),
    note: z.string().trim().max(500).optional(),
  })
  .strict();

const deleteSchema = z
  .object({
    id: z.string().trim().min(1).max(100),
  })
  .strict();

type MixedEdgeRecord = {
  id: string;
  ownerId: string;
  placeholderId: string;
  userId: string;
  relationshipType: string;
  note: string | null;
  createdAt: Date;
};

function normalizeEdge(edge: MixedEdgeRecord): PrivateMixedConnectionEdge {
  return {
    id: edge.id,
    ownerId: edge.ownerId,
    placeholderId: edge.placeholderId,
    userId: edge.userId,
    relationshipType: edge.relationshipType as RelationshipType,
    note: edge.note ?? "",
    createdAt: edge.createdAt.toISOString(),
  };
}

async function ensureMixedEdgeTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "PrivateMixedConnectionEdge" (
      "id" TEXT PRIMARY KEY,
      "ownerId" TEXT NOT NULL,
      "placeholderId" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "relationshipType" TEXT NOT NULL,
      "note" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "PrivateMixedConnectionEdge_owner_fk"
        FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE,
      CONSTRAINT "PrivateMixedConnectionEdge_placeholder_fk"
        FOREIGN KEY ("placeholderId") REFERENCES "PlaceholderPerson"("id") ON DELETE CASCADE,
      CONSTRAINT "PrivateMixedConnectionEdge_user_fk"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "PrivateMixedConnectionEdge_owner_pair_unique"
    ON "PrivateMixedConnectionEdge" ("ownerId", "placeholderId", "userId");
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "PrivateMixedConnectionEdge_owner_idx"
    ON "PrivateMixedConnectionEdge" ("ownerId");
  `);
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

  const clerkId = await resolveClerkUserId(request);
  if (!clerkId) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const dbUserId = await ensureDbUserIdByClerkId(clerkId);
  return { dbUserId };
}

async function getConfirmedDirectConnectionIds(ownerId: string) {
  const relationships = await prisma.relationship.findMany({
    where: {
      OR: [{ user1Id: ownerId }, { user2Id: ownerId }],
      NOT: { type: { startsWith: pendingTypePrefix } },
    },
    select: { user1Id: true, user2Id: true },
  });

  const ids = new Set<string>();
  for (const relationship of relationships) {
    const otherId =
      relationship.user1Id === ownerId ? relationship.user2Id : relationship.user1Id;
    ids.add(otherId);
  }

  return ids;
}

export async function GET(request: Request) {
  try {
    const authResult = await getAuthenticatedDbUserId(request);
    if (authResult.error) return authResult.error;

    await ensureMixedEdgeTable();

    const rows = await prisma.$queryRaw<MixedEdgeRecord[]>`
      SELECT
        "id",
        "ownerId",
        "placeholderId",
        "userId",
        "relationshipType",
        "note",
        "createdAt"
      FROM "PrivateMixedConnectionEdge"
      WHERE "ownerId" = ${authResult.dbUserId}
      ORDER BY "createdAt" DESC
    `;

    return NextResponse.json({ edges: rows.map(normalizeEdge) });
  } catch (error) {
    console.error("Failed to load private mixed web edges", error);
    return NextResponse.json(
      { error: "Could not load private mixed web connections." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const authResult = await getAuthenticatedDbUserId(request);
    if (authResult.error) return authResult.error;
    const ownerId = authResult.dbUserId;
    const lockMessage = await getActiveUserLockMessage(ownerId);
    if (lockMessage) {
      return NextResponse.json({ error: lockMessage }, { status: 403 });
    }

    const ip = getRequestIp(request);
    const rateLimit = await checkRateLimit(`private-web-mixed-post:${ownerId}:${ip}`, {
      windowMs: 5 * 60 * 1000,
      maxRequests: 50,
    });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please slow down." },
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

    const parsed = createSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
    }

    const { placeholderId, userId, relationshipType, note } = parsed.data;

    const placeholder = await prisma.placeholderPerson.findUnique({
      where: { id: placeholderId },
      select: { id: true, ownerId: true },
    });

    if (!placeholder || placeholder.ownerId !== ownerId) {
      return NextResponse.json(
        { error: "Placeholder must be in your private chart." },
        { status: 403 },
      );
    }

    const confirmedIds = await getConfirmedDirectConnectionIds(ownerId);
    if (!confirmedIds.has(userId)) {
      return NextResponse.json(
        { error: "User must be one of your confirmed direct connections." },
        { status: 403 },
      );
    }

    await ensureMixedEdgeTable();

    const existing = await prisma.$queryRaw<MixedEdgeRecord[]>`
      SELECT
        "id",
        "ownerId",
        "placeholderId",
        "userId",
        "relationshipType",
        "note",
        "createdAt"
      FROM "PrivateMixedConnectionEdge"
      WHERE "ownerId" = ${ownerId}
        AND "placeholderId" = ${placeholderId}
        AND "userId" = ${userId}
      LIMIT 1
    `;

    if (existing[0]) {
      await prisma.$executeRaw`
        UPDATE "PrivateMixedConnectionEdge"
        SET
          "relationshipType" = ${relationshipType},
          "note" = ${note?.trim() || null},
          "updatedAt" = NOW()
        WHERE "id" = ${existing[0].id}
      `;

      const updated = await prisma.$queryRaw<MixedEdgeRecord[]>`
        SELECT
          "id",
          "ownerId",
          "placeholderId",
          "userId",
          "relationshipType",
          "note",
          "createdAt"
        FROM "PrivateMixedConnectionEdge"
        WHERE "id" = ${existing[0].id}
        LIMIT 1
      `;

      return NextResponse.json({ edge: normalizeEdge(updated[0]) });
    }

    const id = `em_${randomBytes(10).toString("hex")}`;

    await prisma.$executeRaw`
      INSERT INTO "PrivateMixedConnectionEdge"
      (
        "id",
        "ownerId",
        "placeholderId",
        "userId",
        "relationshipType",
        "note",
        "createdAt",
        "updatedAt"
      )
      VALUES
      (
        ${id},
        ${ownerId},
        ${placeholderId},
        ${userId},
        ${relationshipType},
        ${note?.trim() || null},
        NOW(),
        NOW()
      )
    `;

    const created = await prisma.$queryRaw<MixedEdgeRecord[]>`
      SELECT
        "id",
        "ownerId",
        "placeholderId",
        "userId",
        "relationshipType",
        "note",
        "createdAt"
      FROM "PrivateMixedConnectionEdge"
      WHERE "id" = ${id}
      LIMIT 1
    `;

    return NextResponse.json({ edge: normalizeEdge(created[0]) }, { status: 201 });
  } catch (error) {
    console.error("Failed to create private mixed web edge", error);
    return NextResponse.json(
      { error: "Could not create that private mixed connection." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const authResult = await getAuthenticatedDbUserId(request);
    if (authResult.error) return authResult.error;

    const ownerId = authResult.dbUserId;
    const lockMessage = await getActiveUserLockMessage(ownerId);
    if (lockMessage) {
      return NextResponse.json({ error: lockMessage }, { status: 403 });
    }
    const ip = getRequestIp(request);
    const rateLimit = await checkRateLimit(`private-web-mixed-delete:${ownerId}:${ip}`, {
      windowMs: 5 * 60 * 1000,
      maxRequests: 50,
    });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please slow down." },
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

    const parsed = deleteSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
    }

    await ensureMixedEdgeTable();

    const rows = await prisma.$queryRaw<MixedEdgeRecord[]>`
      SELECT
        "id",
        "ownerId",
        "placeholderId",
        "userId",
        "relationshipType",
        "note",
        "createdAt"
      FROM "PrivateMixedConnectionEdge"
      WHERE "id" = ${parsed.data.id}
      LIMIT 1
    `;

    const existing = rows[0];
    if (!existing) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }

    if (existing.ownerId !== ownerId) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    await prisma.$executeRaw`
      DELETE FROM "PrivateMixedConnectionEdge"
      WHERE "id" = ${parsed.data.id}
    `;

    return NextResponse.json({ deleted: true, id: parsed.data.id });
  } catch (error) {
    console.error("Failed to delete private mixed web edge", error);
    return NextResponse.json(
      { error: "Could not delete that private mixed connection." },
      { status: 500 },
    );
  }
}
