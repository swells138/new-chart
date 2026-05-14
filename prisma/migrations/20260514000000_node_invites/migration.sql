CREATE TABLE "NodeInvite" (
  "id" TEXT NOT NULL,
  "placeholderId" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "contactMethod" TEXT NOT NULL,
  "contactValue" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "sentAt" TIMESTAMP(3),
  "acceptedAt" TIMESTAMP(3),
  "expiredAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "failureReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "NodeInvite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NodeInvite_tokenHash_key" ON "NodeInvite"("tokenHash");
CREATE INDEX "NodeInvite_placeholderId_status_idx" ON "NodeInvite"("placeholderId", "status");
CREATE INDEX "NodeInvite_ownerId_createdAt_idx" ON "NodeInvite"("ownerId", "createdAt" DESC);
CREATE INDEX "NodeInvite_contactValue_createdAt_idx" ON "NodeInvite"("contactValue", "createdAt" DESC);

ALTER TABLE "NodeInvite"
  ADD CONSTRAINT "NodeInvite_placeholderId_fkey"
  FOREIGN KEY ("placeholderId") REFERENCES "PlaceholderPerson"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
