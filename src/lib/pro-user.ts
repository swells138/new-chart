const HARDCODED_PRO_EMAILS = new Set(["sydneywells103@gmail.com"]);

export function isHardcodedProEmail(email: string | null | undefined) {
  return HARDCODED_PRO_EMAILS.has((email ?? "").trim().toLowerCase());
}

export function getEffectiveIsPro(input: {
  email?: string | null | undefined;
  isPro?: boolean | null;
}) {
  return Boolean(input.isPro) || isHardcodedProEmail(input.email);
}
