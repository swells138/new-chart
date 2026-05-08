import { NextResponse } from "next/server";
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { isHardcodedProEmail } from "@/lib/pro-user";

// IMPORTANT: set STRIPE_WEBHOOK_SECRET in Vercel to your webhook signing secret
export async function POST(req: Request) {
  const signature = req.headers.get("stripe-signature") || "";
  const body = await req.text();
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!secretKey) {
    console.error("Missing STRIPE_SECRET_KEY");
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  if (!webhookSecret) {
    console.error("Missing STRIPE_WEBHOOK_SECRET");
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  const stripe = new Stripe(secretKey);

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // Handle relevant events
  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const purchaseType = session.metadata?.purchaseType;
      const dbUserId = session.metadata?.dbUserId as string | undefined;
      const customerId =
        typeof session.customer === "string" ? session.customer : undefined;
      const subscriptionId =
        typeof session.subscription === "string"
          ? session.subscription
          : undefined;

      if (dbUserId && purchaseType !== "connection_unlock") {
        // If we have a subscription id, check its status — only mark active subscriptions as pro
        let isActive = true;
        if (subscriptionId) {
          try {
            const sub = await stripe.subscriptions.retrieve(subscriptionId);
            isActive = sub.status === "active" || sub.status === "trialing";
          } catch (e) {
            console.warn("Failed to fetch subscription status", e);
          }
        }

        const updateData: {
          stripeCustomerId?: string;
          stripeSubscriptionId?: string;
          isPro?: boolean;
        } = {};
        if (customerId) updateData.stripeCustomerId = customerId;
        if (subscriptionId) updateData.stripeSubscriptionId = subscriptionId;
        if (isActive) updateData.isPro = true;

        await prisma.user.update({ where: { id: dbUserId }, data: updateData });
      }
    }

    if (event.type === "invoice.payment_failed") {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId =
        typeof invoice.customer === "string" ? invoice.customer : undefined;
      if (customerId) {
        // Mark user as not pro if payment fails for their subscription
        const users = await prisma.user.findMany({
          where: { stripeCustomerId: customerId },
          select: { id: true, email: true },
        });
        const demotableUserIds = users
          .filter((user) => !isHardcodedProEmail(user.email))
          .map((user) => user.id);

        if (demotableUserIds.length > 0) {
          await prisma.user.updateMany({
            where: { id: { in: demotableUserIds } },
            data: { isPro: false },
          });
        }
      }
    }

    if (event.type === "customer.subscription.deleted") {
      const subscription = event.data.object as Stripe.Subscription;
      const subscriptionId = subscription.id;
      // Unset pro flag for users with this subscription id
      const users = await prisma.user.findMany({
        where: { stripeSubscriptionId: subscriptionId },
        select: { id: true, email: true },
      });
      const demotableUserIds = users
        .filter((user) => !isHardcodedProEmail(user.email))
        .map((user) => user.id);

      if (demotableUserIds.length > 0) {
        await prisma.user.updateMany({
          where: { id: { in: demotableUserIds } },
          data: { isPro: false },
        });
      }
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("Error handling webhook event", err);
    return NextResponse.json(
      { error: "Webhook handler error" },
      { status: 500 },
    );
  }
}
