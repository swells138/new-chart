import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  SMS_HELP_MESSAGE,
  SMS_OPT_IN_CONFIRMATION_MESSAGE,
  SMS_OPT_IN_KEYWORDS,
  SMS_STOP_CONFIRMATION_MESSAGE,
} from "@/lib/sms-templates";
import { clearPhoneOptOut, markPhoneOptedOut } from "@/lib/sms";

function getFormValue(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  // Twilio posts x-www-form-urlencoded by default
  const form = await request.formData();

  const from = getFormValue(form, "From");
  const body = getFormValue(form, "Body");
  const messageSid = getFormValue(form, "MessageSid");

  const normalizedBody = body.toUpperCase();

  // best-effort lookup user by phone number
  const matchedUser = from
    ? await prisma.user.findFirst({
        where: { phoneNumber: from },
        select: { id: true },
      })
    : null;

  if (!from) {
    return new Response("Missing From", { status: 400 });
  }

  if (normalizedBody === "STOP") {
    await markPhoneOptedOut({
      phoneNumber: from,
      userId: matchedUser?.id ?? null,
      messageSid: messageSid || null,
    });

    // Mark most recent invites to this number as opted_out (best-effort)
    try {
      await prisma.$executeRaw`
        UPDATE "NodeInvite"
        SET "status" = 'opted_out',
            "failedAt" = ${new Date()},
            "failureReason" = 'Recipient replied STOP',
            "updatedAt" = ${new Date()}
        WHERE "contactMethod" = 'phone'
          AND "contactValue" = ${from}
          AND "status" = 'pending'
      `;
    } catch {
      // Non-fatal
    }

    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${SMS_STOP_CONFIRMATION_MESSAGE}</Message></Response>`,
      { headers: { "Content-Type": "text/xml" } },
    );
  }

  if (normalizedBody === "HELP") {
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${SMS_HELP_MESSAGE}</Message></Response>`,
      { headers: { "Content-Type": "text/xml" } },
    );
  }

  if (SMS_OPT_IN_KEYWORDS.has(normalizedBody)) {
    await clearPhoneOptOut(from);

    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${SMS_OPT_IN_CONFIRMATION_MESSAGE}</Message></Response>`,
      { headers: { "Content-Type": "text/xml" } },
    );
  }

  return NextResponse.json({ ok: true });
}
