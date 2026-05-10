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

export async function POST() {
  const allowed = await isCurrentUserModerator();
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const email = await getCurrentUserPrimaryEmail();
  if (!email) {
    return NextResponse.json(
      { error: "Your account does not have an email address to test with." },
      { status: 400 },
    );
  }

  try {
    await sendTestEmail(email);
    return NextResponse.json({ sentTo: email });
  } catch (error) {
    console.error("Failed to send moderation test email", error);
    return NextResponse.json(
      { error: getSendGridErrorMessage(error) },
      { status: 500 },
    );
  }
}
