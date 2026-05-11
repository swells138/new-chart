import { NextResponse } from "next/server";
import Stripe from "stripe";
import { z } from "zod";
import { resolveClerkUserId } from "@/lib/clerk-auth";
import { ensureDbUserIdByClerkId } from "@/lib/db-user-bootstrap";
import { checkRateLimit, getRequestIp } from "@/lib/rate-limit";

const checkoutSchema = z
  .object({
    purchaseType: z.enum(["connection_unlock", "pro"]).optional(),
    targetUserId: z.string().trim().min(1).max(100).optional(),
  })
  .strict();

const hasClerkKeys =
  Boolean(process.env.CLERK_SECRET_KEY) &&
  Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ||
      process.env.CLERK_PUBLISHABLE_KEY,
  );

function normalizeOrigin(input: string | null | undefined) {
  if (!input) {
    return null;
  }

  try {
    const origin = input.startsWith("http") ? input : `https://${input}`;
    return new URL(origin).origin;
  } catch {
    return null;
  }
}

function getConfiguredOrigin() {
  return (
    normalizeOrigin(process.env.NEXT_PUBLIC_APP_URL) ??
    normalizeOrigin(process.env.NEXT_PUBLIC_SITE_URL) ??
    normalizeOrigin(process.env.NEXT_PUBLIC_BASE_URL) ??
    normalizeOrigin(process.env.BASE_URL) ??
    normalizeOrigin(process.env.VERCEL_URL)
  );
}

function getTrustedOrigin(req: Request) {
  const requestUrlOrigin = new URL(req.url).origin;
  const headerOrigin = normalizeOrigin(req.headers.get("origin"));
  const configuredOrigin = getConfiguredOrigin();
  const allowedOrigins = new Set(
    [configuredOrigin, requestUrlOrigin].filter(
      (origin): origin is string => Boolean(origin),
    ),
  );

  if (headerOrigin && !allowedOrigins.has(headerOrigin)) {
    return {
      error: NextResponse.json({ error: "Invalid checkout origin." }, { status: 403 }),
    };
  }

  return { origin: configuredOrigin ?? requestUrlOrigin };
}

export async function GET() {
  // Help callers who accidentally hit this route with GET
  return NextResponse.json(
    {
      error:
        "Method GET not allowed. POST a JSON body to create a checkout session.",
    },
    { status: 405 },
  );
}

export async function POST(req: Request) {
  try {
    if (!hasClerkKeys) {
      return NextResponse.json(
        { error: "Auth is not configured." },
        { status: 503 },
      );
    }

    const clerkUserId = await resolveClerkUserId(req);
    if (!clerkUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const dbUserId = await ensureDbUserIdByClerkId(clerkUserId);
    const ip = getRequestIp(req);
    const rateLimit = await checkRateLimit(`stripe-checkout:${dbUserId}:${ip}`, {
      windowMs: 5 * 60 * 1000,
      maxRequests: 10,
    });

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many checkout attempts. Please try again shortly." },
        {
          status: 429,
          headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
        },
      );
    }

    const originResult = getTrustedOrigin(req);
    if (originResult.error) {
      return originResult.error;
    }
    const origin = originResult.origin;

    let payload: unknown;
    try {
      payload = await req.json();
    } catch {
      payload = {};
    }

    const parsed = checkoutSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid checkout payload." }, { status: 400 });
    }

    // Validate secret key presence before constructing Stripe client
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      console.error("Missing STRIPE_SECRET_KEY environment variable");
      return NextResponse.json(
        { error: "Missing STRIPE_SECRET_KEY environment variable" },
        { status: 500 },
      );
    }

    const purchaseType = parsed.data.purchaseType ?? "pro";
    const isConnectionUnlock = purchaseType === "connection_unlock";

    const priceOrProductId = isConnectionUnlock
      ? process.env.connectionProductID
      : process.env.STRIPE_PRICE_ID_PRO ||
        process.env.STRIPE_PRICE_ID ||
        process.env.NEXT_PUBLIC_STRIPE_PRICE_ID ||
        process.env.Product_ID;

    if (!priceOrProductId) {
      console.error(
        isConnectionUnlock
          ? "Missing Stripe price id. Ensure connectionProductID is set."
          : "Missing Stripe price id. Ensure STRIPE_PRICE_ID_PRO or STRIPE_PRICE_ID (or Product_ID) is set.",
        {
          connectionProductID: !!process.env.connectionProductID,
          STRIPE_PRICE_ID_PRO: !!process.env.STRIPE_PRICE_ID_PRO,
          STRIPE_PRICE_ID: !!process.env.STRIPE_PRICE_ID,
          NEXT_PUBLIC_STRIPE_PRICE_ID:
            !!process.env.NEXT_PUBLIC_STRIPE_PRICE_ID,
          Product_ID: !!process.env.Product_ID,
        },
      );

      return NextResponse.json(
        {
          error: isConnectionUnlock
            ? "Missing connectionProductID environment variable"
            : "Missing STRIPE_PRICE_ID_PRO or STRIPE_PRICE_ID (or Product_ID) environment variable",
        },
        { status: 500 },
      );
    }

    // Create Stripe client after validating secret
    // Instantiate Stripe without specifying apiVersion so it uses the SDK's default
    const stripe = new Stripe(secretKey);
    let priceId = priceOrProductId;

    if (priceOrProductId.startsWith("prod_")) {
      const product = await stripe.products.retrieve(priceOrProductId, {
        expand: ["default_price"],
      });
      const defaultPrice = product.default_price;
      const resolvedPriceId =
        typeof defaultPrice === "string" ? defaultPrice : defaultPrice?.id;

      if (!resolvedPriceId) {
        return NextResponse.json(
          {
            error:
              "Stripe product is missing a default price. Add a default price or use a price id.",
          },
          { status: 500 },
        );
      }

      priceId = resolvedPriceId;
    }

    const targetUserId = parsed.data.targetUserId;
    const connectionUnlockSuccessUrl = new URL("/map", origin);
    connectionUnlockSuccessUrl.searchParams.set("connection_unlock", "success");
    if (targetUserId) {
      connectionUnlockSuccessUrl.searchParams.set("targetUserId", targetUserId);
    }

    const session = await stripe.checkout.sessions.create({
      mode: isConnectionUnlock ? "payment" : "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: isConnectionUnlock
        ? connectionUnlockSuccessUrl.toString()
        : `${origin}/profile?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: isConnectionUnlock
        ? `${origin}/map${targetUserId ? `?targetUserId=${encodeURIComponent(targetUserId)}` : ""}`
        : `${origin}/profile?canceled=true`,
      metadata: {
        purchaseType,
        ...(dbUserId ? { dbUserId } : {}),
        ...(targetUserId ? { targetUserId } : {}),
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    // Log full error server-side for debugging
    console.error("Stripe checkout error", err);

    // In non-production return the error message in the JSON response to help debugging.
    const nonProd = process.env.NODE_ENV !== "production";
    const errorMessage =
      err instanceof Error
        ? err.message
        : typeof err === "object"
          ? JSON.stringify(err)
          : String(err);

    return NextResponse.json(
      { error: nonProd ? errorMessage : "Internal server error" },
      { status: 500 },
    );
  }
}
