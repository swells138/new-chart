import { createHash } from "crypto";
import { sendOperationalErrorNotification } from "@/lib/email";

type AlertSource = "server" | "client";

export type OperationalErrorAlertInput = {
  source: AlertSource;
  message: string;
  name?: string | null;
  stack?: string | null;
  digest?: string | null;
  path?: string | null;
  method?: string | null;
  routePath?: string | null;
  routeType?: string | null;
  userAgent?: string | null;
  href?: string | null;
  componentStack?: string | null;
};

type AlertBucket = {
  sentAt: number;
};

const dedupeWindowMs = 15 * 60 * 1000;
const globalAlertState = globalThis as typeof globalThis & {
  __meshyErrorAlertBuckets?: Map<string, AlertBucket>;
};

const alertBuckets =
  globalAlertState.__meshyErrorAlertBuckets ?? new Map<string, AlertBucket>();

if (!globalAlertState.__meshyErrorAlertBuckets) {
  globalAlertState.__meshyErrorAlertBuckets = alertBuckets;
}

function truncate(value: string | null | undefined, maxLength: number) {
  if (!value) {
    return "";
  }

  return value.length > maxLength
    ? `${value.slice(0, Math.max(0, maxLength - 3))}...`
    : value;
}

function getFingerprint(input: OperationalErrorAlertInput) {
  const raw = [
    input.source,
    input.name ?? "Error",
    truncate(input.message, 240),
    input.digest ?? "",
    input.routePath ?? input.path ?? input.href ?? "",
  ].join("|");

  return createHash("sha256").update(raw).digest("hex").slice(0, 16);
}

function shouldTreatAsQuotaRisk(input: OperationalErrorAlertInput) {
  const haystack = [
    input.name,
    input.message,
    input.stack,
    input.path,
    input.routePath,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return /\b(quota|limit|rate.?limit|usage|hobby|plan|payment required|insufficient|timeout|429|503)\b/.test(
    haystack,
  );
}

function shouldSend(fingerprint: string) {
  const now = Date.now();
  const existing = alertBuckets.get(fingerprint);

  if (existing && now - existing.sentAt < dedupeWindowMs) {
    return false;
  }

  alertBuckets.set(fingerprint, { sentAt: now });

  for (const [key, bucket] of alertBuckets) {
    if (now - bucket.sentAt > dedupeWindowMs * 2) {
      alertBuckets.delete(key);
    }
  }

  return true;
}

export async function notifyOperationalError(
  input: OperationalErrorAlertInput,
) {
  const fingerprint = getFingerprint(input);
  if (!shouldSend(fingerprint)) {
    return { sent: false, skipped: "deduped" as const, fingerprint };
  }

  const quotaRisk = shouldTreatAsQuotaRisk(input);
  const location =
    input.routePath ?? input.path ?? input.href ?? "unknown location";
  const subject = `${quotaRisk ? "URGENT " : ""}Chart ${input.source} error: ${truncate(location, 80)}`;
  const text = [
    quotaRisk
      ? "This error looks like it may be related to a plan, quota, rate limit, timeout, or unavailable service."
      : "An uncaught error was captured by Chart.",
    "",
    `Source: ${input.source}`,
    `Fingerprint: ${fingerprint}`,
    `Name: ${input.name ?? "Error"}`,
    `Message: ${truncate(input.message, 2000) || "No message provided."}`,
    input.digest ? `Digest: ${input.digest}` : undefined,
    input.method ? `Method: ${input.method}` : undefined,
    input.path ? `Path: ${input.path}` : undefined,
    input.routePath ? `Route file: ${input.routePath}` : undefined,
    input.routeType ? `Route type: ${input.routeType}` : undefined,
    input.href ? `Browser URL: ${input.href}` : undefined,
    input.userAgent ? `User agent: ${truncate(input.userAgent, 500)}` : undefined,
    input.componentStack
      ? `Component stack:\n${truncate(input.componentStack, 2000)}`
      : undefined,
    input.stack ? `Stack:\n${truncate(input.stack, 4000)}` : undefined,
  ]
    .filter(Boolean)
    .join("\n");

  await sendOperationalErrorNotification({ subject, text });
  return { sent: true, fingerprint };
}
