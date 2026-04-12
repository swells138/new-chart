ALTER TABLE "User"
ADD COLUMN "phoneNumber" TEXT,
ADD COLUMN "ignoredClaimPlaceholderIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "PlaceholderPerson"
ADD COLUMN "email" TEXT,
ADD COLUMN "phoneNumber" TEXT;

CREATE UNIQUE INDEX "User_phoneNumber_key" ON "User"("phoneNumber");