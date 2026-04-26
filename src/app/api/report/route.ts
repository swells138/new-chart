import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, getRequestIp } from "@/lib/rate-limit";
import { createModerationReport } from "@/lib/moderation/reports";

const reportRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    email: z.string().trim().email().max(200),
    link: z.string().trim().min(1).max(400),
    reason: z.string().trim().min(1).max(2000),
  })
  .strict();

export async function POST(request: Request) {
  try {
    const ip = getRequestIp(request);
    const rateLimit = await checkRateLimit(`report-remove-form:${ip}`, {
      windowMs: 5 * 60 * 1000,
      maxRequests: 20,
    });

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please try again shortly." },
        {
          status: 429,
          headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
        },
      );
    }

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const parsed = reportRequestSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid report request." }, { status: 400 });
    }

    const { name, email, link, reason } = parsed.data;

    await createModerationReport({
      kind: "report-remove-request",
      targetId: link,
      targetLabel: `Report/Remove request: ${name}`,
      reporterUserId: null,
      reporterLabel: `${name} <${email}>`,
      reason: [
        "Submitted via Report / Remove Me form",
        `Name: ${name}`,
        `Email: ${email}`,
        `Link: ${link}`,
        `Reason: ${reason}`,
      ].join("\n"),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to submit report/remove request", error);
    return NextResponse.json(
      { error: "Could not submit your request right now." },
      { status: 500 },
    );
  }
}
