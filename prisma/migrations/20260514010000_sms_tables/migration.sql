CREATE TABLE IF NOT EXISTS "SmsConsentEvent" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "phoneNumber" TEXT NOT NULL,
  "consented" BOOLEAN NOT NULL,
  "source" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SmsConsentEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SmsConsentEvent_phoneNumber_createdAt_idx"
ON "SmsConsentEvent"("phoneNumber", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "SmsConsentEvent_userId_createdAt_idx"
ON "SmsConsentEvent"("userId", "createdAt" DESC);

CREATE TABLE IF NOT EXISTS "SmsOptOut" (
  "phoneNumber" TEXT NOT NULL,
  "optedOutAt" TIMESTAMP(3) NOT NULL,
  "optedOutUserId" TEXT,
  "lastMessageSid" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SmsOptOut_pkey" PRIMARY KEY ("phoneNumber")
);

CREATE TABLE IF NOT EXISTS "SmsMessageLog" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "phoneNumber" TEXT NOT NULL,
  "inviteToken" TEXT,
  "messageType" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "twilioMessageSid" TEXT,
  "status" TEXT NOT NULL,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SmsMessageLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SmsMessageLog_phoneNumber_createdAt_idx"
ON "SmsMessageLog"("phoneNumber", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "SmsMessageLog_twilioMessageSid_idx"
ON "SmsMessageLog"("twilioMessageSid");

CREATE INDEX IF NOT EXISTS "SmsMessageLog_userId_createdAt_idx"
ON "SmsMessageLog"("userId", "createdAt" DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SmsConsentEvent_userId_fkey'
  ) THEN
    ALTER TABLE "SmsConsentEvent"
    ADD CONSTRAINT "SmsConsentEvent_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SmsOptOut_optedOutUserId_fkey'
  ) THEN
    ALTER TABLE "SmsOptOut"
    ADD CONSTRAINT "SmsOptOut_optedOutUserId_fkey"
    FOREIGN KEY ("optedOutUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SmsMessageLog_userId_fkey'
  ) THEN
    ALTER TABLE "SmsMessageLog"
    ADD CONSTRAINT "SmsMessageLog_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
