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

    // Support multiple env var names for the price id (backwards compatibility)
    const priceId =
      process.env.STRIPE_PRICE_ID_PRO ||
      process.env.STRIPE_PRICE_ID ||
      process.env.NEXT_PUBLIC_STRIPE_PRICE_ID ||
      process.env.Product_ID;

    if (!priceId) {
      console.error(
        "Missing Stripe price id. Ensure STRIPE_PRICE_ID_PRO or STRIPE_PRICE_ID (or Product_ID) is set.",
        {
          STRIPE_PRICE_ID_PRO: !!process.env.STRIPE_PRICE_ID_PRO,
          STRIPE_PRICE_ID: !!process.env.STRIPE_PRICE_ID,
          NEXT_PUBLIC_STRIPE_PRICE_ID:
            !!process.env.NEXT_PUBLIC_STRIPE_PRICE_ID,
          Product_ID: !!process.env.Product_ID,
        },
      );

      return NextResponse.json(
        {
          error:
            "Missing STRIPE_PRICE_ID_PRO or STRIPE_PRICE_ID (or Product_ID) environment variable",
        },
        { status: 500 },
      );
    }

    // Create Stripe client after validating secret
    // Instantiate Stripe without specifying apiVersion so it uses the SDK's default
    const stripe = new Stripe(secretKey);

    // Allow the client to pass the local DB user id so it can be associated with the checkout session.
    const dbUserId = typeof body.userId === "string" ? body.userId : undefined;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/profile?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/profile?canceled=true`,
      metadata: dbUserId ? { dbUserId } : undefined,
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
