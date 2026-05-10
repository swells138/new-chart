import sgMail from "@sendgrid/mail";

function getEmailConfig() {
  const apiKey = process.env.SENDGRID_API_KEY?.trim();
  const from = process.env.SENDGRID_FROM_EMAIL?.trim();

  if (!apiKey || !from) {
    return null;
  }

  return { apiKey, from };
}

export async function sendInviteEmail(
  to: string,
  token: string,
  ownerName: string,
  relationshipType: string,
  note?: string | null,
) {
  const config = getEmailConfig();
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.NEXT_PUBLIC_BASE_URL ??
    process.env.BASE_URL ??
    "";

  if (!config || !siteUrl) {
    // Missing configuration — silently return (non-fatal)
    return;
  }

  // Configure the SendGrid client
  sgMail.setApiKey(config.apiKey);

  const inviteUrl = `${siteUrl.replace(/\/+$/, "")}/invite/${token}`;
  const subject = `${ownerName ?? "Someone"} invited you on Chart`;

  const plainText = [
    `${ownerName ?? "Someone"} added you as ${relationshipType} on Chart and is waiting for your confirmation.`,
    "",
    `Open the link to accept or decline: ${inviteUrl}`,
    note ? "" : undefined,
    note ? `Note from them: ${note}` : undefined,
    "",
    "Thanks,",
    "Chart team",
  ]
    .filter(Boolean)
    .join("\n");

  const msg = {
    to,
    from: config.from,
    subject,
    text: plainText,
    // You can add html if desired in the future
  } as const;

  try {
    await sgMail.send(msg);
  } catch (err) {
    // swallow errors; caller will log if desired
    console.error("sendInviteEmail failed", err);
  }
}

export async function sendTestEmail(to: string) {
  const config = getEmailConfig();

  if (!config) {
    throw new Error("SendGrid is missing SENDGRID_API_KEY or SENDGRID_FROM_EMAIL.");
  }

  sgMail.setApiKey(config.apiKey);

  await sgMail.send({
    to,
    from: config.from,
    subject: "Chart SendGrid production test",
    text: [
      "This is a test email from Chart.",
      "",
      "If you received this, SendGrid is configured correctly in this environment.",
    ].join("\n"),
  });
}
