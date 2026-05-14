import twilio from "twilio";

export function getTwilioClient() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();

  if (!accountSid || !authToken) {
    return null;
  }

  return twilio(accountSid, authToken);
}

export function getTwilioFromNumber() {
  const from = process.env.TWILIO_FROM_NUMBER?.trim();
  return from || null;
}
