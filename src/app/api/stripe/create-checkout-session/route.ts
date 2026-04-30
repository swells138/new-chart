import { NextResponse } from "next/server";
import Stripe from "stripe";

// Make sure you've installed the Stripe package: npm install stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: "2022-11-15",
});

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const origin =
      (body && body.origin) ||
      req.headers.get("origin") ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "http://localhost:3000";

    const priceId = process.env.STRIPE_PRICE_ID_PRO;
    if (!priceId) {
      return NextResponse.json(
        { error: "Missing STRIPE_PRICE_ID_PRO environment variable" },
        { status: 500 },
      );
    }

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
    console.error("Stripe checkout error", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
