"use client";

import React from "react";

export default function CheckoutClient({
  priceInfo,
}: {
  priceInfo: {
    id: string | null;
    display: string;
    amount: number | null;
    currency: string | null;
    interval: string | null;
  };
}) {
  const [loading, setLoading] = React.useState(false);

  async function startCheckout() {
    try {
      setLoading(true);
      const res = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data?.url) {
        window.location.href = data.url;
      } else {
        alert(data.error || "Failed to create checkout session");
      }
    } catch (err) {
      console.error(err);
      alert("Checkout failed");
    } finally {
      setLoading(false);
    }
  }

  // Derive a large price display like "$X /mo" when unit amount exists
  const largePrice =
    priceInfo.amount && priceInfo.currency
      ? `$${(priceInfo.amount / 100).toFixed(0)}/${priceInfo.interval ?? "mo"}`
      : "$X/mo";

  return (
    <div className="flex flex-col items-center text-center gap-6">
      <div className="w-full">
        <h1 className="text-2xl font-semibold">Upgrade to Pro</h1>
        <p className="mt-2 text-sm text-white/70">
          See how you’re connected and explore deeper
        </p>
      </div>

      <div className="w-full rounded-xl bg-black/30 border border-white/8 p-5">
        <div className="flex items-baseline justify-center gap-3">
          <div className="text-4xl font-bold tracking-tight">{largePrice}</div>
          <div className="text-sm text-white/70">
            {priceInfo.interval ? `billed ${priceInfo.interval}` : ""}
          </div>
        </div>

        <ul className="mt-4 text-sm text-white/75 space-y-2 list-inside list-disc">
          <li>See full connection paths</li>
          <li>Unlock full profiles</li>
          <li>Explore beyond your network</li>
        </ul>

        <div className="mt-6 flex flex-col items-center gap-3">
          <button
            className="w-full rounded-lg bg-[#ff7b6b] px-4 py-3 text-sm font-semibold text-white shadow-lg hover:brightness-95 disabled:opacity-70"
            onClick={() => void startCheckout()}
            disabled={loading}
          >
            {loading ? "Starting…" : "Upgrade to Pro"}
          </button>

          <button
            type="button"
            onClick={() => window.history.back()}
            className="text-xs text-white/70"
          >
            Not now
          </button>

          <p className="mt-3 text-[11px] text-white/60">
            Secure checkout powered by Stripe
          </p>
        </div>
      </div>
    </div>
  );
}
