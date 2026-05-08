import { NextResponse } from "next/server";
import Stripe from "stripe";

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
    const body = await req.json().catch(() => ({}));
    const origin =
      (body && body.origin) ||
      req.headers.get("origin") ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "http://localhost:3000";

    // Validate secret key presence before constructing Stripe client
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      console.error("Missing STRIPE_SECRET_KEY environment variable");
      return NextResponse.json(
        { error: "Missing STRIPE_SECRET_KEY environment variable" },
        { status: 500 },
      );
    }

    const purchaseType =
      body.purchaseType === "connection_unlock" ? "connection_unlock" : "pro";
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

    // Allow the client to pass the local DB user id so it can be associated with the checkout session.
    const dbUserId = typeof body.userId === "string" ? body.userId : undefined;
    const targetUserId =
      typeof body.targetUserId === "string" ? body.targetUserId : undefined;
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
