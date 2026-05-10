import sgMail from "@sendgrid/mail";

export async function sendInviteEmail(
  to: string,
  token: string,
  ownerName: string,
  relationshipType: string,
  note?: string | null,
) {
  const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
  const SENDGRID_FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL;
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.NEXT_PUBLIC_BASE_URL ??
    process.env.BASE_URL ??
    "";

  if (!SENDGRID_API_KEY || !SENDGRID_FROM_EMAIL || !siteUrl) {
    // Missing configuration — silently return (non-fatal)
    return;
  }

  // Configure the SendGrid client
  sgMail.setApiKey(SENDGRID_API_KEY);

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
    from: SENDGRID_FROM_EMAIL,
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
