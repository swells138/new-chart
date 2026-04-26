import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";

export type ModerationReportStatus = "open" | "resolved" | "dismissed";
export type ModerationReportKind =
  | "public-node"
  | "private-node"
  | "report-remove-request";
export type ModerationAction =
  | "none"
  | "remove-public-connections"
  | "hide-private-node"
  | "lock-target-24h"
  | "lock-target-72h"
  | "lock-target-7d";

export interface ModerationReport {
  id: string;
  kind: ModerationReportKind;
  targetId: string;
  targetLabel: string | null;
  reason: string | null;
  reporterUserId: string | null;
  reporterLabel: string | null;
  status: ModerationReportStatus;
  decisionNote: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
}

interface UserLockRow {
  userId: string;
  reason: string | null;
  lockedBy: string | null;
  lockedUntil: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ModerationUserLock {
  userId: string;
  reason: string | null;
  lockedBy: string | null;
  lockedUntil: string;
  createdAt: string;
  updatedAt: string;
}

interface ModerationReportRow {
  id: string;
  kind: string;
  targetId: string;
  targetLabel: string | null;
  reason: string | null;
  reporterUserId: string | null;
  reporterLabel: string | null;
  status: string;
  decisionNote: string | null;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt: Date | null;
}

let moderationTableReady = false;
let moderationLockTableReady = false;

async function ensureModerationReportsTable() {
  if (moderationTableReady) {
    return;
  }

  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS "ModerationReport" (
      "id" TEXT PRIMARY KEY,
      "kind" TEXT NOT NULL,
      "targetId" TEXT NOT NULL,
      "targetLabel" TEXT,
      "reason" TEXT,
      "reporterUserId" TEXT,
      "reporterLabel" TEXT,
      "status" TEXT NOT NULL DEFAULT 'open',
      "decisionNote" TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "resolvedAt" TIMESTAMPTZ
    )
  `;

  await prisma.$executeRaw`
    CREATE INDEX IF NOT EXISTS "ModerationReport_status_createdAt_idx"
    ON "ModerationReport" ("status", "createdAt" DESC)
  `;

  moderationTableReady = true;
}

async function ensureModerationUserLockTable() {
  if (moderationLockTableReady) {
    return;
  }

  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS "ModerationUserLock" (
      "userId" TEXT PRIMARY KEY,
      "reason" TEXT,
      "lockedBy" TEXT,
      "lockedUntil" TIMESTAMPTZ NOT NULL,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await prisma.$executeRaw`
    CREATE INDEX IF NOT EXISTS "ModerationUserLock_lockedUntil_idx"
    ON "ModerationUserLock" ("lockedUntil")
  `;

  moderationLockTableReady = true;
}

function toReport(row: ModerationReportRow): ModerationReport {
  const kind: ModerationReportKind =
    row.kind === "private-node"
      ? "private-node"
      : row.kind === "report-remove-request"
        ? "report-remove-request"
        : "public-node";
  const status =
    row.status === "resolved"
      ? "resolved"
      : row.status === "dismissed"
        ? "dismissed"
        : "open";

  return {
    id: row.id,
    kind,
    targetId: row.targetId,
    targetLabel: row.targetLabel,
    reason: row.reason,
    reporterUserId: row.reporterUserId,
    reporterLabel: row.reporterLabel,
    status,
    decisionNote: row.decisionNote,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
  };
}

export async function createModerationReport(input: {
  kind: ModerationReportKind;
  targetId: string;
  targetLabel?: string | null;
  reason?: string | null;
  reporterUserId?: string | null;
  reporterLabel?: string | null;
}) {
  await ensureModerationReportsTable();

  const id = randomUUID();

  await prisma.$executeRaw`
    INSERT INTO "ModerationReport" (
      "id",
      "kind",
      "targetId",
      "targetLabel",
      "reason",
      "reporterUserId",
      "reporterLabel",
      "status",
      "createdAt",
      "updatedAt"
    )
    VALUES (
      ${id},
      ${input.kind},
      ${input.targetId},
      ${input.targetLabel ?? null},
      ${input.reason ?? null},
      ${input.reporterUserId ?? null},
      ${input.reporterLabel ?? null},
      ${"open"},
      NOW(),
      NOW()
    )
  `;

  return id;
}

export async function listModerationReports(limit = 200) {
  await ensureModerationReportsTable();

  const safeLimit = Math.max(1, Math.min(500, limit));

  const rows = await prisma.$queryRaw<ModerationReportRow[]>`
    SELECT
      "id",
      "kind",
      "targetId",
      "targetLabel",
      "reason",
      "reporterUserId",
      "reporterLabel",
      "status",
      "decisionNote",
      "createdAt",
      "updatedAt",
      "resolvedAt"
    FROM "ModerationReport"
    ORDER BY
      CASE WHEN "status" = 'open' THEN 0 ELSE 1 END,
      "createdAt" DESC
    LIMIT ${safeLimit}
  `;

  return rows.map(toReport);
}

export async function updateModerationReportStatus(input: {
  id: string;
  status: ModerationReportStatus;
  decisionNote?: string;
}) {
  await ensureModerationReportsTable();

  const decisionNote = input.decisionNote?.trim() || null;
  const resolvedAt = input.status === "open" ? null : new Date();

  const rows = await prisma.$queryRaw<ModerationReportRow[]>`
    UPDATE "ModerationReport"
    SET
      "status" = ${input.status},
      "decisionNote" = ${decisionNote},
      "resolvedAt" = ${resolvedAt},
      "updatedAt" = NOW()
    WHERE "id" = ${input.id}
    RETURNING
      "id",
      "kind",
      "targetId",
      "targetLabel",
      "reason",
      "reporterUserId",
      "reporterLabel",
      "status",
      "decisionNote",
      "createdAt",
      "updatedAt",
      "resolvedAt"
  `;

  if (rows.length === 0) {
    return null;
  }

  return toReport(rows[0]);
}

export async function getModerationReportById(id: string) {
  await ensureModerationReportsTable();

  const rows = await prisma.$queryRaw<ModerationReportRow[]>`
    SELECT
      "id",
      "kind",
      "targetId",
      "targetLabel",
      "reason",
      "reporterUserId",
      "reporterLabel",
      "status",
      "decisionNote",
      "createdAt",
      "updatedAt",
      "resolvedAt"
    FROM "ModerationReport"
    WHERE "id" = ${id}
    LIMIT 1
  `;

  return rows[0] ? toReport(rows[0]) : null;
}

export async function lockUserUntil(input: {
  userId: string;
  reason?: string | null;
  lockedBy?: string | null;
  until: Date;
}) {
  await ensureModerationUserLockTable();

  await prisma.$executeRaw`
    INSERT INTO "ModerationUserLock"
      ("userId", "reason", "lockedBy", "lockedUntil", "createdAt", "updatedAt")
    VALUES
      (${input.userId}, ${input.reason ?? null}, ${input.lockedBy ?? null}, ${input.until}, NOW(), NOW())
    ON CONFLICT ("userId")
    DO UPDATE SET
      "reason" = EXCLUDED."reason",
      "lockedBy" = EXCLUDED."lockedBy",
      "lockedUntil" = EXCLUDED."lockedUntil",
      "updatedAt" = NOW()
  `;
}

export async function getUserLock(userId: string): Promise<UserLockRow | null> {
  await ensureModerationUserLockTable();

  await prisma.$executeRaw`
    DELETE FROM "ModerationUserLock"
    WHERE "lockedUntil" <= NOW()
  `;

  const rows = await prisma.$queryRaw<UserLockRow[]>`
    SELECT
      "userId",
      "reason",
      "lockedBy",
      "lockedUntil",
      "createdAt",
      "updatedAt"
    FROM "ModerationUserLock"
    WHERE "userId" = ${userId}
    LIMIT 1
  `;

  return rows[0] ?? null;
}

function toUserLock(row: UserLockRow): ModerationUserLock {
  return {
    userId: row.userId,
    reason: row.reason,
    lockedBy: row.lockedBy,
    lockedUntil: row.lockedUntil.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listUserLocks(limit = 200): Promise<ModerationUserLock[]> {
  await ensureModerationUserLockTable();

  await prisma.$executeRaw`
    DELETE FROM "ModerationUserLock"
    WHERE "lockedUntil" <= NOW()
  `;

  const safeLimit = Math.max(1, Math.min(500, limit));
  const rows = await prisma.$queryRaw<UserLockRow[]>`
    SELECT
      "userId",
      "reason",
      "lockedBy",
      "lockedUntil",
      "createdAt",
      "updatedAt"
    FROM "ModerationUserLock"
    ORDER BY "lockedUntil" DESC
    LIMIT ${safeLimit}
  `;

  return rows.map(toUserLock);
}

export async function clearUserLock(userId: string) {
  await ensureModerationUserLockTable();

  const rows = await prisma.$queryRaw<UserLockRow[]>`
    DELETE FROM "ModerationUserLock"
    WHERE "userId" = ${userId}
    RETURNING
      "userId",
      "reason",
      "lockedBy",
      "lockedUntil",
      "createdAt",
      "updatedAt"
  `;

  if (!rows[0]) {
    return null;
  }

  return toUserLock(rows[0]);
}
