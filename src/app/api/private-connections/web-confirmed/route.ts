import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveClerkUserId } from "@/lib/clerk-auth";
import { ensureDbUserIdByClerkId } from "@/lib/db-user-bootstrap";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, getRequestIp } from "@/lib/rate-limit";
import type {
  PrivateConfirmedConnectionEdge,
  RelationshipType,
} from "@/types/models";

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
    sourceUserId: z.string().trim().min(1).max(100),
    targetUserId: z.string().trim().min(1).max(100),
    relationshipType: z.enum(relationshipTypeValues),
    note: z.string().trim().max(500).optional(),
  })
  .strict();

const deleteSchema = z
  .object({
    id: z.string().trim().min(1).max(100),
  })
  .strict();

type ConfirmedEdgeRecord = {
  id: string;
  ownerId: string;
  sourceUserId: string;
  targetUserId: string;
  relationshipType: string;
  note: string | null;
  createdAt: Date;
};

function normalizeEdge(edge: ConfirmedEdgeRecord): PrivateConfirmedConnectionEdge {
  return {
    id: edge.id,
    ownerId: edge.ownerId,
    sourceUserId: edge.sourceUserId,
    targetUserId: edge.targetUserId,
    relationshipType: edge.relationshipType as RelationshipType,
    note: edge.note ?? "",
    createdAt: edge.createdAt.toISOString(),
  };
}

function normalizePair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

async function ensureConfirmedEdgeTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "PrivateConfirmedConnectionEdge" (
      "id" TEXT PRIMARY KEY,
      "ownerId" TEXT NOT NULL,
      "sourceUserId" TEXT NOT NULL,
      "targetUserId" TEXT NOT NULL,
      "relationshipType" TEXT NOT NULL,
      "note" TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT "PrivateConfirmedConnectionEdge_owner_fk"
        FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE,
      CONSTRAINT "PrivateConfirmedConnectionEdge_source_fk"
        FOREIGN KEY ("sourceUserId") REFERENCES "User"("id") ON DELETE CASCADE,
      CONSTRAINT "PrivateConfirmedConnectionEdge_target_fk"
        FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE CASCADE,
      CONSTRAINT "PrivateConfirmedConnectionEdge_distinct_nodes"
        CHECK ("sourceUserId" <> "targetUserId")
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "PrivateConfirmedConnectionEdge_owner_pair_unique"
    ON "PrivateConfirmedConnectionEdge" ("ownerId", "sourceUserId", "targetUserId");
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "PrivateConfirmedConnectionEdge_owner_idx"
    ON "PrivateConfirmedConnectionEdge" ("ownerId");
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
    const otherId = relationship.user1Id === ownerId ? relationship.user2Id : relationship.user1Id;
    ids.add(otherId);
  }

  return ids;
}

export async function GET(request: Request) {
  try {
    const authResult = await getAuthenticatedDbUserId(request);
    if (authResult.error) return authResult.error;

    await ensureConfirmedEdgeTable();

    const rows = await prisma.$queryRaw<ConfirmedEdgeRecord[]>`
      SELECT
        "id",
        "ownerId",
        "sourceUserId",
        "targetUserId",
        "relationshipType",
        "note",
        "createdAt"
      FROM "PrivateConfirmedConnectionEdge"
      WHERE "ownerId" = ${authResult.dbUserId}
      ORDER BY "createdAt" DESC
    `;

    return NextResponse.json({ edges: rows.map(normalizeEdge) });
  } catch (error) {
    console.error("Failed to list private confirmed web edges", error);
    return NextResponse.json(
      { error: "Could not load private confirmed web connections." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const authResult = await getAuthenticatedDbUserId(request);
    if (authResult.error) return authResult.error;
    const ownerId = authResult.dbUserId;

    const ip = getRequestIp(request);
    const rateLimit = await checkRateLimit(`private-web-confirmed-post:${ownerId}:${ip}`, {
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

    const { sourceUserId, targetUserId, relationshipType, note } = parsed.data;

    if (sourceUserId === targetUserId) {
      return NextResponse.json({ error: "Choose two different nodes." }, { status: 400 });
    }

    const [sourceId, targetId] = normalizePair(sourceUserId, targetUserId);

    const confirmedIds = await getConfirmedDirectConnectionIds(ownerId);
    if (!confirmedIds.has(sourceId) || !confirmedIds.has(targetId)) {
      return NextResponse.json(
        { error: "Both users must be your confirmed direct connections." },
        { status: 403 },
      );
    }

    await ensureConfirmedEdgeTable();

    const existing = await prisma.$queryRaw<ConfirmedEdgeRecord[]>`
      SELECT
        "id",
        "ownerId",
        "sourceUserId",
        "targetUserId",
        "relationshipType",
        "note",
        "createdAt"
      FROM "PrivateConfirmedConnectionEdge"
      WHERE "ownerId" = ${ownerId}
        AND "sourceUserId" = ${sourceId}
        AND "targetUserId" = ${targetId}
      LIMIT 1
    `;

    if (existing[0]) {
      await prisma.$executeRaw`
        UPDATE "PrivateConfirmedConnectionEdge"
        SET
          "relationshipType" = ${relationshipType},
          "note" = ${note?.trim() || null},
          "updatedAt" = NOW()
        WHERE "id" = ${existing[0].id}
      `;

      const updated = await prisma.$queryRaw<ConfirmedEdgeRecord[]>`
        SELECT
          "id",
          "ownerId",
          "sourceUserId",
          "targetUserId",
          "relationshipType",
          "note",
          "createdAt"
        FROM "PrivateConfirmedConnectionEdge"
        WHERE "id" = ${existing[0].id}
        LIMIT 1
      `;

      return NextResponse.json({ edge: normalizeEdge(updated[0]) });
    }

    const id = `ec_${randomBytes(10).toString("hex")}`;

    await prisma.$executeRaw`
      INSERT INTO "PrivateConfirmedConnectionEdge"
      (
        "id",
        "ownerId",
        "sourceUserId",
        "targetUserId",
        "relationshipType",
        "note",
        "createdAt",
        "updatedAt"
      )
      VALUES
      (
        ${id},
        ${ownerId},
        ${sourceId},
        ${targetId},
        ${relationshipType},
        ${note?.trim() || null},
        NOW(),
        NOW()
      )
    `;

    const created = await prisma.$queryRaw<ConfirmedEdgeRecord[]>`
      SELECT
        "id",
        "ownerId",
        "sourceUserId",
        "targetUserId",
        "relationshipType",
        "note",
        "createdAt"
      FROM "PrivateConfirmedConnectionEdge"
      WHERE "id" = ${id}
      LIMIT 1
    `;

    return NextResponse.json({ edge: normalizeEdge(created[0]) }, { status: 201 });
  } catch (error) {
    console.error("Failed to create private confirmed web edge", error);
    return NextResponse.json(
      { error: "Could not create that private confirmed connection." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const authResult = await getAuthenticatedDbUserId(request);
    if (authResult.error) return authResult.error;

    const ownerId = authResult.dbUserId;
    const ip = getRequestIp(request);
    const rateLimit = await checkRateLimit(`private-web-confirmed-delete:${ownerId}:${ip}`, {
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

    await ensureConfirmedEdgeTable();

    const rows = await prisma.$queryRaw<ConfirmedEdgeRecord[]>`
      SELECT
        "id",
        "ownerId",
        "sourceUserId",
        "targetUserId",
        "relationshipType",
        "note",
        "createdAt"
      FROM "PrivateConfirmedConnectionEdge"
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
      DELETE FROM "PrivateConfirmedConnectionEdge"
      WHERE "id" = ${parsed.data.id}
    `;

    return NextResponse.json({ deleted: true, id: parsed.data.id });
  } catch (error) {
    console.error("Failed to delete private confirmed web edge", error);
    return NextResponse.json(
      { error: "Could not delete that private confirmed connection." },
      { status: 500 },
    );
  }
}
