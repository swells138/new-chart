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

  const payload = {
    personalizations: [
      {
        to: [{ email: to }],
      },
    ],
    from: { email: SENDGRID_FROM_EMAIL },
    subject,
    content: [
      {
        type: "text/plain",
        value: plainText,
      },
    ],
  };

  try {
    await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SENDGRID_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    // swallow errors; caller will log if desired
    console.error("sendInviteEmail failed", err);
  }
}
