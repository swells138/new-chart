import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Stripe from "stripe";
import { ensureDbUserByClerkId } from "@/lib/db-user-bootstrap";
import CheckoutClient from "@/components/checkout/checkout-client";

export const metadata = {
  title: "Go Pro — Checkout",
};

export default async function CheckoutPage() {
  const { userId } = await auth();
  if (!userId) {
    redirect("/login");
  }

  // Ensure DB user exists and get their id
  const dbUser = await ensureDbUserByClerkId(userId, "New member");

  const priceId = process.env.STRIPE_PRICE_ID_PRO || process.env.product_ID;

  const priceData = {
    id: priceId,
    display: "Pro",
    amount: null as number | null,
    currency: null as string | null,
    interval: null as string | null,
  };

  if (priceId) {
    try {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
        apiVersion: "2022-11-15",
      });
      const price = await stripe.prices.retrieve(priceId as string);
      priceData.amount = (price.unit_amount ?? null) as number | null;
      priceData.currency = price.currency ?? null;
      priceData.interval =
        (price.recurring as Stripe.Price.Recurring | null)?.interval ?? null;
      priceData.display = price.product
        ? typeof price.product === "string"
          ? "Pro"
          : ((price.product as any).name ?? "Pro")
        : "Pro";
    } catch (e) {
      // ignore - we'll show a simple fallback
      console.warn("Failed to fetch price details", e);
    }
  }

  return (
    <div className="mx-auto max-w-xl p-6">
      <h1 className="text-2xl font-semibold mb-4">Upgrade to Pro</h1>
      <p className="mb-6">
        Unlock Pro features and get a prettier profile on the chart.
      </p>
      <CheckoutClient dbUserId={dbUser.id} priceInfo={priceData} />
    </div>
  );
}
