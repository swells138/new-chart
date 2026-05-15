import sgMail from "@sendgrid/mail";
import type { MailDataRequired } from "@sendgrid/mail";

const DEFAULT_FROM_NAME = "MeshyLinks";
const DEFAULT_ERROR_ALERT_EMAIL = "sydneywells103@gmail.com";
const TRANSACTIONAL_TRACKING_SETTINGS = {
  clickTracking: {
    enable: false,
    enableText: false,
  },
  openTracking: {
    enable: false,
  },
} satisfies MailDataRequired["trackingSettings"];

function getEmailConfig() {
  const apiKey = process.env.SENDGRID_API_KEY?.trim();
  const fromEmail = process.env.SENDGRID_FROM_EMAIL?.trim();
  const fromName =
    process.env.SENDGRID_FROM_NAME?.trim() || DEFAULT_FROM_NAME;
  const replyTo = process.env.SENDGRID_REPLY_TO_EMAIL?.trim();

  if (!apiKey || !fromEmail) {
    return null;
  }

  return { apiKey, fromEmail, fromName, replyTo };
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function textToHtml(text: string) {
  return text
    .split(/\n{2,}/)
    .map((paragraph) => {
      const html = escapeHtml(paragraph).replaceAll("\n", "<br>");
      return `<p>${html}</p>`;
    })
    .join("");
}

function buildTransactionalEmail(input: {
  to: string | string[];
  subject: string;
  text: string;
  category: string;
}): MailDataRequired {
  const config = getEmailConfig();
  if (!config) {
    throw new Error(
      "SendGrid is missing SENDGRID_API_KEY or SENDGRID_FROM_EMAIL.",
    );
  }

  return {
    to: input.to,
    from: {
      email: config.fromEmail,
      name: config.fromName,
    },
    replyTo: config.replyTo ? { email: config.replyTo } : undefined,
    subject: input.subject,
    text: input.text,
    html: `<!doctype html><html><body style="font-family:Arial,sans-serif;font-size:16px;line-height:1.5;color:#111827">${textToHtml(input.text)}</body></html>`,
    categories: [input.category],
    trackingSettings: TRANSACTIONAL_TRACKING_SETTINGS,
  };
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
    // Missing configuration — warn so developers can detect in logs.
    console.warn(
      "sendInviteEmail skipped: missing SendGrid config or site URL",
      {
        hasSendGridConfig: Boolean(config),
        siteUrlProvided: Boolean(siteUrl),
        to,
      },
    );
    return;
  }

  // Configure the SendGrid client
  sgMail.setApiKey(config.apiKey);

  const inviteUrl = `${siteUrl.replace(/\/+$/, "")}/invite/${token}`;
  const subject = `${ownerName ?? "Someone"} invited you to MeshyLinks`;

  const plainText = [
    `${ownerName ?? "Someone"} invited you to verify a ${relationshipType} connection on MeshyLinks.`,
    "",
    `Open the link to accept or decline: ${inviteUrl}`,
    note ? "" : undefined,
    note ? `Note from them: ${note}` : undefined,
    "",
    "Thanks,",
    "MeshyLinks team",
  ]
    .filter(Boolean)
    .join("\n");

  const msg = {
    ...buildTransactionalEmail({
      to,
      subject,
      text: plainText,
      category: "invite",
    }),
    subject,
  };

  try {
    await sgMail.send(msg);
  } catch (err) {
    // swallow errors; caller will log if desired
    console.error("sendInviteEmail failed", err);
  }
}

export async function sendNodeInviteEmail(input: {
  to: string;
  token: string;
  inviterName: string;
}) {
  const config = getEmailConfig();
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.NEXT_PUBLIC_BASE_URL ??
    process.env.BASE_URL ??
    "";

  if (!config || !siteUrl) {
    throw new Error("SendGrid config or site URL is missing.");
  }

  sgMail.setApiKey(config.apiKey);

  const inviteUrl = `${siteUrl.replace(/\/+$/, "")}/invite/${input.token}`;
  const inviterName = input.inviterName || "Someone";
  const subject = `${inviterName} invited you to MeshyLinks`;
  const plainText = [
    `You've been invited to MeshyLinks by ${inviterName}.`,
    "",
    "They invited you to verify a connection on MeshyLinks.",
    "Sign up to claim your profile and approve or manage the connection.",
    "",
    `Claim your profile here: ${inviteUrl}`,
  ].join("\n");

  return sgMail.send(
    buildTransactionalEmail({
      to: input.to,
      subject,
      text: plainText,
      category: "node-invite",
    }),
  );
}

export async function sendTestEmail(to: string) {
  const config = getEmailConfig();

  if (!config) {
    throw new Error(
      "SendGrid is missing SENDGRID_API_KEY or SENDGRID_FROM_EMAIL.",
    );
  }

  sgMail.setApiKey(config.apiKey);

  // Return the raw SendGrid response to allow callers to inspect headers/status for debugging
  const res = await sgMail.send(buildTransactionalEmail({
    to,
    subject: "Chart SendGrid production test",
    text: [
      "This is a test email from Chart.",
      "",
      "If you received this, SendGrid is configured correctly in this environment.",
    ].join("\n"),
    category: "test",
  }));

  return res;
}

export async function sendModerationNotification(input: {
  reportId?: string | null;
  kind: string;
  targetId: string;
  targetLabel?: string | null;
  reason?: string | null;
  reporterLabel?: string | null;
}) {
  const config = getEmailConfig();
  if (!config) {
    console.warn("sendModerationNotification skipped: missing SendGrid config");
    return null;
  }

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.NEXT_PUBLIC_BASE_URL ??
    process.env.BASE_URL ??
    "";

  const modEmails = (process.env.MODERATOR_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (modEmails.length === 0) {
    console.warn(
      "sendModerationNotification skipped: MODERATOR_EMAILS is empty",
    );
    return null;
  }

  sgMail.setApiKey(config.apiKey);

  const subject = `Moderation: new ${input.kind} — ${
    input.targetLabel ?? input.targetId
  }`;

  const moderationUrl = siteUrl
    ? `${siteUrl.replace(/\/+$/, "")}/moderation${
        input.reportId
          ? `?reportId=${encodeURIComponent(input.reportId)}#report-${encodeURIComponent(input.reportId)}`
          : ""
      }`
    : "";

  const plainText = [
    `A new moderation report was submitted:`,
    "",
    `Kind: ${input.kind}`,
    `Target: ${input.targetLabel ?? input.targetId}`,
    input.reason ? `Reason:\n${input.reason}` : undefined,
    input.reporterLabel ? `Reporter: ${input.reporterLabel}` : undefined,
    moderationUrl ? "" : undefined,
    moderationUrl ? `Review it here: ${moderationUrl}` : undefined,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const res = await sgMail.send(buildTransactionalEmail({
      to: modEmails,
      subject,
      text: plainText,
      category: "moderation",
    }));
    return res;
  } catch (err) {
    console.error("sendModerationNotification failed", err);
    return null;
  }
}

export async function sendUserNotificationEmail(opts: {
  to: string;
  subject: string;
  text: string;
}) {
  const config = getEmailConfig();
  if (!config) {
    console.warn("sendUserNotificationEmail skipped: missing SendGrid config");
    return null;
  }

  sgMail.setApiKey(config.apiKey);

  try {
    const res = await sgMail.send(buildTransactionalEmail({
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      category: "notification",
    }));
    return res;
  } catch (err) {
    console.error("sendUserNotificationEmail failed", err);
    return null;
  }
}

function getErrorAlertEmails() {
  const configured =
    process.env.ERROR_ALERT_EMAILS ??
    process.env.OPERATIONAL_ALERT_EMAILS ??
    DEFAULT_ERROR_ALERT_EMAIL;

  return configured
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean);
}

export async function sendOperationalErrorNotification(input: {
  subject: string;
  text: string;
}) {
  const config = getEmailConfig();
  if (!config) {
    console.warn(
      "sendOperationalErrorNotification skipped: missing SendGrid config",
    );
    return null;
  }

  const to = getErrorAlertEmails();
  if (to.length === 0) {
    console.warn(
      "sendOperationalErrorNotification skipped: no alert recipients",
    );
    return null;
  }

  sgMail.setApiKey(config.apiKey);

  try {
    const res = await sgMail.send(
      buildTransactionalEmail({
        to,
        subject: input.subject,
        text: input.text,
        category: "operational-error",
      }),
    );
    return res;
  } catch (err) {
    console.error("sendOperationalErrorNotification failed", err);
    return null;
  }
}
