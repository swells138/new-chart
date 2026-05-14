import { NextResponse } from "next/server";
import { z } from "zod";
import { notifyOperationalError } from "@/lib/error-alerts";
import { checkRateLimit, getRequestIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const clientErrorSchema = z
  .object({
    message: z.string().trim().min(1).max(2000),
    name: z.string().trim().max(120).optional(),
    stack: z.string().trim().max(8000).optional(),
    href: z.string().trim().max(1000).optional(),
    userAgent: z.string().trim().max(500).optional(),
    componentStack: z.string().trim().max(4000).optional(),
  })
  .strict();

export async function POST(request: Request) {
  const rateLimit = await checkRateLimit(
    `error-alerts:${getRequestIp(request)}`,
    {
      windowMs: 60 * 60 * 1000,
      maxRequests: 10,
    },
  );

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many error reports." },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateLimit.retryAfterSeconds),
        },
      },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = clientErrorSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid error report." },
      { status: 400 },
    );
  }

  const result = await notifyOperationalError({
    source: "client",
    ...parsed.data,
    path: new URL(request.url).pathname,
    userAgent: parsed.data.userAgent ?? request.headers.get("user-agent"),
  });

  return NextResponse.json({ ok: true, ...result });
}
