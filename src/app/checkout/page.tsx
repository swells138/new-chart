import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Stripe from "stripe";
import { ensureDbUserByClerkId } from "@/lib/db-user-bootstrap";
import { getEffectiveIsPro } from "@/lib/pro-user";
import CheckoutClient from "@/components/checkout/checkout-client";

export const metadata = {
  title: "Go Pro — Checkout",
};

function getClerkPrimaryEmail(clerk: Awaited<ReturnType<typeof currentUser>>) {
  const primaryEmailId = clerk?.primaryEmailAddressId;
  const primaryEmail = clerk?.emailAddresses.find(
    (email) => email.id === primaryEmailId,
  )?.emailAddress;

  return primaryEmail ?? clerk?.emailAddresses[0]?.emailAddress ?? null;
}

export default async function CheckoutPage() {
  const { userId } = await auth();
  if (!userId) {
    redirect("/login");
  }

  // Ensure DB user exists and get their id
  const clerk = await currentUser();
  const fullName =
    [clerk?.firstName, clerk?.lastName].filter(Boolean).join(" ").trim() ||
    clerk?.username ||
    "New member";
  const dbUser = await ensureDbUserByClerkId(
    userId,
    fullName,
    clerk?.imageUrl,
    getClerkPrimaryEmail(clerk),
  );

  if (getEffectiveIsPro(dbUser)) {
    redirect("/map");
  }

  const priceId = process.env.STRIPE_PRICE_ID_PRO || process.env.Product_ID;

  const priceData = {
    id: priceId ?? null,
    display: "Pro",
    amount: null as number | null,
    currency: null as string | null,
    interval: null as string | null,
  };

  if (priceId) {
    try {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);
      const price = await stripe.prices.retrieve(priceId as string);
      priceData.amount = (price.unit_amount ?? null) as number | null;
      priceData.currency = price.currency ?? null;
      priceData.interval =
        (price.recurring as Stripe.Price.Recurring | null)?.interval ?? null;
      if (
        price.product &&
        typeof price.product !== "string" &&
        "name" in price.product &&
        typeof price.product.name === "string"
      ) {
        priceData.display = price.product.name;
      }
    } catch (e) {
      // ignore - we'll show a simple fallback
      console.warn("Failed to fetch price details", e);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-linear-to-b from-[#06040a] to-[#0f0819] p-6">
      <div className="w-full max-w-md rounded-2xl border border-white/8 bg-white/4 backdrop-blur-lg p-8 shadow-[0_18px_40px_rgba(0,0,0,0.6)]">
        <CheckoutClient dbUserId={dbUser.id} priceInfo={priceData} />
      </div>
    </div>
  );
}
