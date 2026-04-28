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
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3)
);

CREATE INDEX IF NOT EXISTS "ModerationReport_status_createdAt_idx"
ON "ModerationReport" ("status", "createdAt" DESC);

CREATE TABLE IF NOT EXISTS "ModerationUserLock" (
  "userId" TEXT PRIMARY KEY,
  "reason" TEXT,
  "lockedBy" TEXT,
  "lockedUntil" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "ModerationUserLock_lockedUntil_idx"
ON "ModerationUserLock" ("lockedUntil");
