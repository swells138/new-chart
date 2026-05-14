import type { Instrumentation } from "next";

export function register() {}

function normalizeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      digest:
        "digest" in error && typeof error.digest === "string"
          ? error.digest
          : undefined,
    };
  }

  return {
    name: "Error",
    message: String(error ?? "Unknown error"),
    stack: undefined,
    digest: undefined,
  };
}

export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  if (request.path.includes("/api/error-alerts")) {
    return;
  }

  const { notifyOperationalError } = await import("@/lib/error-alerts");
  const normalizedError = normalizeError(error);

  await notifyOperationalError({
    source: "server",
    name: normalizedError.name,
    message: normalizedError.message,
    stack: normalizedError.stack,
    digest: normalizedError.digest,
    path: request.path,
    method: request.method,
    routePath: context.routePath,
    routeType: context.routeType,
    userAgent: Array.isArray(request.headers["user-agent"])
      ? request.headers["user-agent"].join(", ")
      : request.headers["user-agent"],
  });
};
