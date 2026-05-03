DROP TABLE IF EXISTS "PrivateMixedConnectionEdge";
DROP TABLE IF EXISTS "PrivateConfirmedConnectionEdge";
DROP TABLE IF EXISTS "PrivateConnectionEdge";

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

CREATE UNIQUE INDEX IF NOT EXISTS "PrivateConnectionEdge_owner_pair_unique"
  ON "PrivateConnectionEdge" ("ownerId", "sourcePlaceholderId", "targetPlaceholderId");

CREATE INDEX IF NOT EXISTS "PrivateConnectionEdge_owner_idx"
  ON "PrivateConnectionEdge" ("ownerId");

CREATE TABLE IF NOT EXISTS "PrivateConfirmedConnectionEdge" (
  "id" TEXT PRIMARY KEY,
  "ownerId" TEXT NOT NULL,
  "sourceUserId" TEXT NOT NULL,
  "targetUserId" TEXT NOT NULL,
  "relationshipType" TEXT NOT NULL,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PrivateConfirmedConnectionEdge_owner_fk"
    FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE,
  CONSTRAINT "PrivateConfirmedConnectionEdge_source_fk"
    FOREIGN KEY ("sourceUserId") REFERENCES "User"("id") ON DELETE CASCADE,
  CONSTRAINT "PrivateConfirmedConnectionEdge_target_fk"
    FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE CASCADE,
  CONSTRAINT "PrivateConfirmedConnectionEdge_distinct_nodes"
    CHECK ("sourceUserId" <> "targetUserId")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PrivateConfirmedConnectionEdge_owner_pair_unique"
  ON "PrivateConfirmedConnectionEdge" ("ownerId", "sourceUserId", "targetUserId");

CREATE INDEX IF NOT EXISTS "PrivateConfirmedConnectionEdge_owner_idx"
  ON "PrivateConfirmedConnectionEdge" ("ownerId");

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

CREATE UNIQUE INDEX IF NOT EXISTS "PrivateMixedConnectionEdge_owner_pair_unique"
  ON "PrivateMixedConnectionEdge" ("ownerId", "placeholderId", "userId");

CREATE INDEX IF NOT EXISTS "PrivateMixedConnectionEdge_owner_idx"
  ON "PrivateMixedConnectionEdge" ("ownerId");
