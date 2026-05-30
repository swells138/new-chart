import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const hasClerkKeys =
  Boolean(process.env.CLERK_SECRET_KEY) &&
  Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ||
      process.env.CLERK_PUBLISHABLE_KEY
  );

const AGE_COOKIE_NAME = "age_verified";
const HIDDEN_ROUTES = new Set<string>();
const isProtectedRoute = createRouteMatcher([
  "/",
  "/map(.*)",
  "/profile(.*)",
  "/members(.*)",
  "/feed(.*)",
  "/inbox(.*)",
  "/claim-connections(.*)",
  "/checkout(.*)",
  "/moderation(.*)",
  "/report(.*)",
  "/api/claim-connections(.*)",
  "/api/private-connections(.*)",
  "/api/profile(.*)",
  "/api/relationships(.*)",
  "/api/report(.*)",
  "/api/users(.*)",
]);

function handleHiddenRoutes(request: NextRequest) {
  if (!HIDDEN_ROUTES.has(request.nextUrl.pathname)) {
    return null;
  }

  const redirectUrl = request.nextUrl.clone();
  redirectUrl.pathname = "/map";
  redirectUrl.search = "";
  return NextResponse.redirect(redirectUrl);
}

function shouldBypassAgeGate(pathname: string) {
  return (
    pathname.startsWith("/age-check") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico"
  );
}

function handleAgeGate(request: NextRequest) {
  if (shouldBypassAgeGate(request.nextUrl.pathname)) {
    return null;
  }

  const isVerifiedAdult = request.cookies.get(AGE_COOKIE_NAME)?.value === "true";
  if (isVerifiedAdult) {
    return null;
  }

  const redirectUrl = request.nextUrl.clone();
  const requestedPath = `${request.nextUrl.pathname}${request.nextUrl.search}`;

  redirectUrl.pathname = "/age-check";
  redirectUrl.search = "";
  redirectUrl.searchParams.set("redirectTo", requestedPath || "/");

  return NextResponse.redirect(redirectUrl);
}

const proxyWithAuth = clerkMiddleware(async (auth, request) => {
  const hiddenRouteResponse = handleHiddenRoutes(request);
  if (hiddenRouteResponse) {
    return hiddenRouteResponse;
  }

  const ageGateResponse = handleAgeGate(request);
  if (ageGateResponse) {
    return ageGateResponse;
  }

  if (isProtectedRoute(request)) {
    await auth.protect();
  }

  return NextResponse.next();
});

export default hasClerkKeys
  ? proxyWithAuth
  : function proxyFallback(request: NextRequest) {
      const hiddenRouteResponse = handleHiddenRoutes(request);
      if (hiddenRouteResponse) {
        return hiddenRouteResponse;
      }

      const ageGateResponse = handleAgeGate(request);
      if (ageGateResponse) {
        return ageGateResponse;
      }

      return NextResponse.next();
    };

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
