import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const AGE_COOKIE_NAME = "age_verified";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

function getSafeRedirectPath(input: string | null) {
  if (!input || !input.startsWith("/") || input.startsWith("//")) {
    return "/";
  }

  if (input.startsWith("/age-check")) {
    return "/";
  }

  return input;
}

export function POST(request: NextRequest) {
  const redirectTo = getSafeRedirectPath(
    request.nextUrl.searchParams.get("redirectTo"),
  );
  const response = NextResponse.redirect(new URL(redirectTo, request.url), 303);

  response.cookies.set({
    name: AGE_COOKIE_NAME,
    value: "true",
    httpOnly: true,
    maxAge: ONE_YEAR_SECONDS,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  return response;
}

export function GET(request: NextRequest) {
  return NextResponse.redirect(new URL("/age-check", request.url));
}
