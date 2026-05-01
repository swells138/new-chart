"use client";

import React from "react";

export default function CheckoutClient({ dbUserId, priceInfo }: { dbUserId: string; priceInfo: { id: string | null; display: string; amount: number | null; currency: string | null; interval: string | null } }) {
  const [loading, setLoading] = React.useState(false);

  async function startCheckout() {
    try {
      setLoading(true);
      const res = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ origin: window.location.origin, userId: dbUserId }),
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

  const priceText = priceInfo.amount && priceInfo.currency ? `${(priceInfo.amount/100).toFixed(2)} ${priceInfo.currency.toUpperCase()} / ${priceInfo.interval ?? "mo"}` : "Pro plan";

  return (
    <div>
      <div className="mb-4">
        <div className="text-lg font-semibold">{priceInfo.display}</div>
        <div className="text-sm text-black/70 dark:text-white/75">{priceText}</div>
      </div>
      <button className="btn-primary" onClick={() => void startCheckout()} disabled={loading}>
        {loading ? "Starting…" : "Continue to secure checkout"}
      </button>
    </div>
  );
}
