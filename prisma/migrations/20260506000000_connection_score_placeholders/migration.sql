-- Add placeholder fields for the connection score system.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "connectionScore" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "totalConnections" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "secondDegreeConnections" INTEGER NOT NULL DEFAULT 0;
