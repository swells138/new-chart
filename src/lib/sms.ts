import { prisma } from "@/lib/prisma";
import type { TransactionalSmsType } from "@/lib/sms-templates";
import { getTwilioClient, getTwilioFromNumber } from "@/lib/twilio";

export type SmsConsentSource =
  | "signup"
  | "login"
  | "invite"
  | "profile"
  | "unknown";

export function normalizeSmsPhoneNumber(value: string) {
  const trimmed = value.trim();

  if (trimmed.startsWith("+")) {
    const digits = trimmed.slice(1).replace(/\D/g, "");
    return digits ? `+${digits}` : "";
  }

  const digits = trimmed.replace(/\D/g, "");

  if (digits.length === 10) {
    return `+1${digits}`;
  }

  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }

  return "";
}

export async function recordSmsConsent(input: {
  phoneNumber: string;
  consented: boolean;
  source: SmsConsentSource;
  userId?: string | null;
}) {
  await prisma.$executeRaw`
    INSERT INTO "SmsConsentEvent" (
      "id",
      "userId",
      "phoneNumber",
      "consented",
      "source",
      "createdAt"
    ) VALUES (
      ${crypto.randomUUID()},
      ${input.userId ?? null},
      ${input.phoneNumber},
      ${input.consented},
      ${input.source},
      ${new Date()}
    )
  `;
}

export async function isPhoneOptedOut(phoneNumber: string) {
  const rows = await prisma.$queryRaw<Array<{ optedOutAt: Date }>>`
    SELECT "optedOutAt"
    FROM "SmsOptOut"
    WHERE "phoneNumber" = ${phoneNumber}
    LIMIT 1
  `;

  return rows.length > 0;
}

export async function markPhoneOptedOut(input: {
  phoneNumber: string;
  userId?: string | null;
  messageSid?: string | null;
}) {
  await prisma.$executeRaw`
    INSERT INTO "SmsOptOut" (
      "phoneNumber",
      "optedOutAt",
      "optedOutUserId",
      "lastMessageSid",
      "updatedAt"
    ) VALUES (
      ${input.phoneNumber},
      ${new Date()},
      ${input.userId ?? null},
      ${input.messageSid ?? null},
      ${new Date()}
    )
    ON CONFLICT ("phoneNumber") DO UPDATE SET
      "optedOutAt" = EXCLUDED."optedOutAt",
      "optedOutUserId" = EXCLUDED."optedOutUserId",
      "lastMessageSid" = EXCLUDED."lastMessageSid",
      "updatedAt" = EXCLUDED."updatedAt"
  `;
}

export async function clearPhoneOptOut(phoneNumber: string) {
  await prisma.$executeRaw`
    DELETE FROM "SmsOptOut" WHERE "phoneNumber" = ${phoneNumber}
  `;
}

async function createSmsLog(input: {
  userId: string | null;
  phoneNumber: string;
  inviteToken: string | null;
  messageType: TransactionalSmsType;
  body: string;
  status: string;
}) {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    INSERT INTO "SmsMessageLog" (
      "id",
      "userId",
      "phoneNumber",
      "inviteToken",
      "messageType",
      "body",
      "status",
      "createdAt",
      "updatedAt"
    ) VALUES (
      ${crypto.randomUUID()},
      ${input.userId},
      ${input.phoneNumber},
      ${input.inviteToken},
      ${input.messageType},
      ${input.body},
      ${input.status},
      ${new Date()},
      ${new Date()}
    )
    RETURNING "id"
  `;

  return rows[0]?.id ?? null;
}

async function updateSmsLog(
  id: string,
  data: { status?: string; sid?: string | null; error?: string | null },
) {
  await prisma.$executeRaw`
    UPDATE "SmsMessageLog"
    SET
      "status" = COALESCE(${data.status ?? null}, "status"),
      "twilioMessageSid" = COALESCE(${data.sid ?? null}, "twilioMessageSid"),
      "error" = COALESCE(${data.error ?? null}, "error"),
      "updatedAt" = ${new Date()}
    WHERE "id" = ${id}
  `;
}

export async function sendTransactionalSms(input: {
  to: string;
  body: string;
  type: TransactionalSmsType;
  userId?: string | null;
  inviteToken?: string | null;
}) {
  const to = normalizeSmsPhoneNumber(input.to);
  if (!to) {
    throw new Error(
      "Enter a valid US phone number with 10 digits, or include a + country code.",
    );
  }

  const optedOut = await isPhoneOptedOut(to);
  if (optedOut) {
    await createSmsLog({
      userId: input.userId ?? null,
      phoneNumber: to,
      messageType: input.type,
      body: input.body,
      status: "blocked_opted_out",
      inviteToken: input.inviteToken ?? null,
    });

    return { skipped: true as const, reason: "opted_out" as const };
  }

  const client = getTwilioClient();
  const from = getTwilioFromNumber();

  if (!client || !from) {
    await createSmsLog({
      userId: input.userId ?? null,
      phoneNumber: to,
      messageType: input.type,
      body: input.body,
      status: "skipped_missing_config",
      inviteToken: input.inviteToken ?? null,
    });

    return { skipped: true as const, reason: "missing_config" as const };
  }

  const logId = await createSmsLog({
    userId: input.userId ?? null,
    phoneNumber: to,
    messageType: input.type,
    body: input.body,
    status: "queued",
    inviteToken: input.inviteToken ?? null,
  });

  try {
    const message = await client.messages.create({
      to,
      from,
      body: input.body,
      statusCallback: process.env.TWILIO_STATUS_CALLBACK_URL ?? undefined,
    });

    if (logId) {
      await updateSmsLog(logId, {
        sid: message.sid,
        status: message.status ?? "sent",
      });
    }

    return { skipped: false as const, sid: message.sid };
  } catch (error) {
    if (logId) {
      await updateSmsLog(logId, {
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      });
    }

    throw error;
  }
}
