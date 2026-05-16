const DEFAULT_MODERATOR_EMAILS = ["sydneywells103@gmail.com"];

function normalizeEmail(input: string | null | undefined) {
  return (input ?? "").trim().toLowerCase();
}

export function parseModeratorEmails(input: string | null | undefined) {
  return new Set(
    [
      ...DEFAULT_MODERATOR_EMAILS,
      ...(input ?? "").split(","),
    ]
      .map(normalizeEmail)
      .filter(Boolean),
  );
}

export function isModeratorEmailAllowed(
  email: string | null | undefined,
  configuredEmails: string | null | undefined,
) {
  return parseModeratorEmails(configuredEmails).has(normalizeEmail(email));
}
