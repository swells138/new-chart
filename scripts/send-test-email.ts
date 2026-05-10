import { loadEnvConfig } from "@next/env";
import sgMail from "@sendgrid/mail";

loadEnvConfig(process.cwd());

function requireEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing ${name}`);
  }
  return value;
}

async function main() {
  const apiKey = requireEnv("SENDGRID_API_KEY");
  const from = requireEnv("SENDGRID_FROM_EMAIL");
  const to = requireEnv("TEST_EMAIL_TO");

  sgMail.setApiKey(apiKey);

  await sgMail.send({
    to,
    from,
    subject: "Chart SendGrid test",
    text: [
      "This is a test email from Chart.",
      "",
      "If you received this, SendGrid is configured correctly.",
    ].join("\n"),
  });

  console.log(`Sent test email to ${to} from ${from}.`);
}

main().catch((error) => {
  console.error("Failed to send test email.");
  console.error(error);
  process.exit(1);
});
