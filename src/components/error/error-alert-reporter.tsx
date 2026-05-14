"use client";

import { useEffect } from "react";

const dedupeWindowMs = 5 * 60 * 1000;
const sentReports = new Map<string, number>();

function getMessage(reason: unknown) {
  if (reason instanceof Error) {
    return reason.message || reason.name;
  }

  if (typeof reason === "string") {
    return reason;
  }

  try {
    return JSON.stringify(reason);
  } catch {
    return String(reason);
  }
}

function getStack(reason: unknown) {
  return reason instanceof Error ? reason.stack : undefined;
}

function getName(reason: unknown) {
  return reason instanceof Error ? reason.name : "Error";
}

function getFingerprint(input: { name: string; message: string; href: string }) {
  return `${input.name}|${input.message.slice(0, 240)}|${input.href}`;
}

function reportClientError(reason: unknown) {
  const href = window.location.href;
  const message = getMessage(reason);
  if (!message) {
    return;
  }

  const payload = {
    name: getName(reason),
    message,
    stack: getStack(reason),
    href,
    userAgent: window.navigator.userAgent,
  };
  const fingerprint = getFingerprint(payload);
  const now = Date.now();
  const lastSent = sentReports.get(fingerprint);

  if (lastSent && now - lastSent < dedupeWindowMs) {
    return;
  }

  sentReports.set(fingerprint, now);

  fetch("/api/error-alerts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {
    sentReports.delete(fingerprint);
  });
}

export function ErrorAlertReporter() {
  useEffect(() => {
    function onError(event: ErrorEvent) {
      reportClientError(event.error ?? event.message);
    }

    function onUnhandledRejection(event: PromiseRejectionEvent) {
      reportClientError(event.reason);
    }

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);

    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, []);

  return null;
}
