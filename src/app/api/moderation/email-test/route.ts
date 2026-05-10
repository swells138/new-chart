import { NextResponse } from "next/server";
import { sendTestEmail } from "@/lib/email";
import {
  getCurrentUserPrimaryEmail,
  isCurrentUserModerator,
} from "@/lib/moderation/auth";

export const dynamic = "force-dynamic";

type SendGridLikeError = {
  code?: number;
  response?: {
    body?: {
      errors?: Array<{ message?: string; field?: string | null }>;
    };
  };
};

function getSendGridErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    const sendGridError = error as Error & SendGridLikeError;
    const firstApiError = sendGridError.response?.body?.errors?.[0];
    if (firstApiError?.message) {
      return firstApiError.field
        ? `${firstApiError.message} (${firstApiError.field})`
        : firstApiError.message;
    }

    return error.message;
  }

  return "SendGrid rejected the test email.";
}

function looksLikeEmail(input: unknown) {
  if (typeof input !== "string") return false;
  const s = input.trim();
  if (!s) return false;
  // Very small, permissive check
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

export async function POST(request: Request) {
  const allowed = await isCurrentUserModerator();
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Try to parse optional { to } from the request body
  let requestedTo: string | undefined;
  try {
    const body = (await request.json()) as { to?: unknown } | null;
    if (body && body.to && looksLikeEmail(body.to)) {
      requestedTo = (body.to as string).trim();
    } else if (body && body.to) {
      return NextResponse.json(
        { error: "Invalid email address." },
        { status: 400 },
      );
    }
  } catch {
    // no body or invalid json — that's fine; we'll fall back to moderator email
  }

  const email = requestedTo ?? (await getCurrentUserPrimaryEmail());
  if (!email) {
    return NextResponse.json(
      { error: "Your account does not have an email address to test with." },
      { status: 400 },
    );
  }

  try {
    const result = await sendTestEmail(email);
    // sendgrid/mail.send typically returns an array with response objects
    const statusCode = Array.isArray(result)
      ? (result[0]?.statusCode ?? null)
      : null;
    return NextResponse.json({ sentTo: email, sendGridStatusCode: statusCode });
  } catch (error) {
    console.error("Failed to send moderation test email", error);
    return NextResponse.json(
      { error: getSendGridErrorMessage(error) },
      { status: 500 },
    );
  }
}
