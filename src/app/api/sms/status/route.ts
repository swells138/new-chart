import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function getFormValue(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  const form = await request.formData();
  const messageSid = getFormValue(form, "MessageSid");
  const messageStatus = getFormValue(form, "MessageStatus");

  if (!messageSid) {
    return NextResponse.json({ error: "Missing MessageSid" }, { status: 400 });
  }

  try {
    await prisma.$executeRaw`
      UPDATE "SmsMessageLog"
      SET "status" = ${messageStatus || "unknown"},
          "updatedAt" = ${new Date()}
      WHERE "twilioMessageSid" = ${messageSid}
    `;
  } catch (error) {
    console.error("Failed to update SMS status", error);
  }

  return NextResponse.json({ ok: true });
}
