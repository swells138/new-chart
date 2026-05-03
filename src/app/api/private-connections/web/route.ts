import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveClerkUserId } from "@/lib/clerk-auth";
import { ensureDbUserIdByClerkId } from "@/lib/db-user-bootstrap";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, getRequestIp } from "@/lib/rate-limit";
import type { PrivateConnectionEdge, RelationshipType } from "@/types/models";
import { getActiveUserLockMessage } from "@/lib/moderation/locks";

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

const createSchema = z
  .object({
    sourcePlaceholderId: z.string().trim().min(1).max(100),
    targetPlaceholderId: z.string().trim().min(1).max(100),
    relationshipType: z.enum(relationshipTypeValues),
    note: z.string().trim().max(500).optional(),
  })
  .strict();

const deleteSchema = z
  .object({
    id: z.string().trim().min(1).max(100),
  })
  .strict();

type PrivateEdgeRecord = {
  id: string;
  ownerId: string;
  sourcePlaceholderId: string;
  targetPlaceholderId: string;
  relationshipType: string;
  note: string | null;
  createdAt: Date;
};

function normalizeEdge(edge: PrivateEdgeRecord): PrivateConnectionEdge {
  return {
    id: edge.id,
    ownerId: edge.ownerId,
    sourcePlaceholderId: edge.sourcePlaceholderId,
    targetPlaceholderId: edge.targetPlaceholderId,
    relationshipType: edge.relationshipType as RelationshipType,
    note: edge.note ?? "",
    createdAt: edge.createdAt.toISOString(),
  };
}

async function ensurePrivateEdgeTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "PrivateConnectionEdge" (
      "id" TEXT PRIMARY KEY,
      "ownerId" TEXT NOT NULL,
      "sourcePlaceholderId" TEXT NOT NULL,
      "targetPlaceholderId" TEXT NOT NULL,
      "relationshipType" TEXT NOT NULL,
      "note" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "PrivateConnectionEdge_owner_fk"
        FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE,
      CONSTRAINT "PrivateConnectionEdge_source_fk"
        FOREIGN KEY ("sourcePlaceholderId") REFERENCES "PlaceholderPerson"("id") ON DELETE CASCADE,
      CONSTRAINT "PrivateConnectionEdge_target_fk"
        FOREIGN KEY ("targetPlaceholderId") REFERENCES "PlaceholderPerson"("id") ON DELETE CASCADE,
      CONSTRAINT "PrivateConnectionEdge_distinct_nodes"
        CHECK ("sourcePlaceholderId" <> "targetPlaceholderId")
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "PrivateConnectionEdge_owner_pair_unique"
    ON "PrivateConnectionEdge" ("ownerId", "sourcePlaceholderId", "targetPlaceholderId");
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "PrivateConnectionEdge_owner_idx"
    ON "PrivateConnectionEdge" ("ownerId");
  `);
}

function normalizePair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
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

export async function GET(request: Request) {
  try {
    const authResult = await getAuthenticatedDbUserId(request);
    if (authResult.error) return authResult.error;

    await ensurePrivateEdgeTable();

    const rows = await prisma.$queryRaw<PrivateEdgeRecord[]>`
      SELECT
        "id",
        "ownerId",
        "sourcePlaceholderId",
        "targetPlaceholderId",
        "relationshipType",
        "note",
        "createdAt"
      FROM "PrivateConnectionEdge"
      WHERE "ownerId" = ${authResult.dbUserId}
      ORDER BY "createdAt" DESC
    `;

    return NextResponse.json({ edges: rows.map(normalizeEdge) });
  } catch (error) {
    console.error("Failed to list private web edges", error);
    return NextResponse.json(
      { error: "Could not load private web connections." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const authResult = await getAuthenticatedDbUserId(request);
    if (authResult.error) return authResult.error;
    const currentDbUserId = authResult.dbUserId;
    const lockMessage = await getActiveUserLockMessage(currentDbUserId);
    if (lockMessage) {
      return NextResponse.json({ error: lockMessage }, { status: 403 });
    }

    const ip = getRequestIp(request);
    const rateLimit = await checkRateLimit(
      `private-web-post:${currentDbUserId}:${ip}`,
      {
        windowMs: 5 * 60 * 1000,
        maxRequests: 50,
      },
    );
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

    const {
      sourcePlaceholderId,
      targetPlaceholderId,
      relationshipType,
      note,
    } = parsed.data;

    if (sourcePlaceholderId === targetPlaceholderId) {
      return NextResponse.json(
        { error: "Choose two different nodes." },
        { status: 400 },
      );
    }

    const [sourceId, targetId] = normalizePair(
      sourcePlaceholderId,
      targetPlaceholderId,
    );

    const ownedPlaceholders = await prisma.placeholderPerson.findMany({
      where: {
        ownerId: currentDbUserId,
        id: { in: [sourceId, targetId] },
      },
      select: { id: true },
    });

    if (ownedPlaceholders.length !== 2) {
      return NextResponse.json(
        { error: "Both nodes must be from your private chart." },
        { status: 403 },
      );
    }

    await ensurePrivateEdgeTable();

    const existing = await prisma.$queryRaw<PrivateEdgeRecord[]>`
      SELECT
        "id",
        "ownerId",
        "sourcePlaceholderId",
        "targetPlaceholderId",
        "relationshipType",
        "note",
        "createdAt"
      FROM "PrivateConnectionEdge"
      WHERE "ownerId" = ${currentDbUserId}
        AND "sourcePlaceholderId" = ${sourceId}
        AND "targetPlaceholderId" = ${targetId}
      LIMIT 1
    `;

    if (existing[0]) {
      await prisma.$executeRaw`
        UPDATE "PrivateConnectionEdge"
        SET
          "relationshipType" = ${relationshipType},
          "note" = ${note?.trim() || null},
          "updatedAt" = NOW()
        WHERE "id" = ${existing[0].id}
      `;

      const updated = await prisma.$queryRaw<PrivateEdgeRecord[]>`
        SELECT
          "id",
          "ownerId",
          "sourcePlaceholderId",
          "targetPlaceholderId",
          "relationshipType",
          "note",
          "createdAt"
        FROM "PrivateConnectionEdge"
        WHERE "id" = ${existing[0].id}
        LIMIT 1
      `;

      return NextResponse.json({ edge: normalizeEdge(updated[0]) });
    }

    const id = `e_${randomBytes(10).toString("hex")}`;

    await prisma.$executeRaw`
      INSERT INTO "PrivateConnectionEdge"
      (
        "id",
        "ownerId",
        "sourcePlaceholderId",
        "targetPlaceholderId",
        "relationshipType",
        "note",
        "createdAt",
        "updatedAt"
      )
      VALUES
      (
        ${id},
        ${currentDbUserId},
        ${sourceId},
        ${targetId},
        ${relationshipType},
        ${note?.trim() || null},
        NOW(),
        NOW()
      )
    `;

    const created = await prisma.$queryRaw<PrivateEdgeRecord[]>`
      SELECT
        "id",
        "ownerId",
        "sourcePlaceholderId",
        "targetPlaceholderId",
        "relationshipType",
        "note",
        "createdAt"
      FROM "PrivateConnectionEdge"
      WHERE "id" = ${id}
      LIMIT 1
    `;

    return NextResponse.json({ edge: normalizeEdge(created[0]) }, { status: 201 });
  } catch (error) {
    console.error("Failed to create private web edge", error);
    return NextResponse.json(
      { error: "Could not create that private connection." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const authResult = await getAuthenticatedDbUserId(request);
    if (authResult.error) return authResult.error;
    const currentDbUserId = authResult.dbUserId;
    const lockMessage = await getActiveUserLockMessage(currentDbUserId);
    if (lockMessage) {
      return NextResponse.json({ error: lockMessage }, { status: 403 });
    }

    const ip = getRequestIp(request);
    const rateLimit = await checkRateLimit(
      `private-web-delete:${currentDbUserId}:${ip}`,
      {
        windowMs: 5 * 60 * 1000,
        maxRequests: 50,
      },
    );
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

    await ensurePrivateEdgeTable();

    const rows = await prisma.$queryRaw<PrivateEdgeRecord[]>`
      SELECT
        "id",
        "ownerId",
        "sourcePlaceholderId",
        "targetPlaceholderId",
        "relationshipType",
        "note",
        "createdAt"
      FROM "PrivateConnectionEdge"
      WHERE "id" = ${parsed.data.id}
      LIMIT 1
    `;

    const existing = rows[0];
    if (!existing) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }

    if (existing.ownerId !== currentDbUserId) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    await prisma.$executeRaw`
      DELETE FROM "PrivateConnectionEdge"
      WHERE "id" = ${parsed.data.id}
    `;

    return NextResponse.json({ deleted: true, id: parsed.data.id });
  } catch (error) {
    console.error("Failed to delete private web edge", error);
    return NextResponse.json(
      { error: "Could not delete that private connection." },
      { status: 500 },
    );
  }
}
