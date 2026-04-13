import { auth, currentUser, verifyToken } from "@clerk/nextjs/server";

function getBearerToken(request?: Request) {
  if (!request) {
    return null;
  }

  const authHeader = request.headers.get("authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return null;
  }

  const token = authHeader.slice(7).trim();
  return token.length > 0 ? token : null;
}

export async function resolveClerkUserId(request?: Request) {
  try {
    const { userId } = await auth();
    if (userId) {
      return userId;
    }
  } catch {
    // Fall through to additional resolution strategies.
  }

  try {
    const clerk = await currentUser();
    if (clerk?.id) {
      return clerk.id;
    }
  } catch {
    // Fall through to bearer token verification.
  }

  const token = getBearerToken(request);
  if (!token || !process.env.CLERK_SECRET_KEY) {
    return null;
  }

  try {
    const verified = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY,
    });

    return typeof verified.sub === "string" ? verified.sub : null;
  } catch {
    return null;
  }
}
