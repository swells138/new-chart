"use client";

import React from "react";

export default function GoProButton({ dbUserId }: { dbUserId?: string }) {
  const [loading, setLoading] = React.useState(false);

  async function handleClick() {
    try {
      setLoading(true);
      const res = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          origin: window.location.origin,
          userId: dbUserId,
        }),
      });
      const data = await res.json();
      if (data?.url) {
        window.location.href = data.url;
      } else if (data?.error) {
        alert(data.error);
      } else {
        alert("Unexpected response from server");
      }
    } catch (err) {
      console.error(err);
      alert("Failed to create checkout session");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      className="btn-primary w-full"
      onClick={handleClick}
      disabled={loading}
      type="button"
    >
      {loading ? "Redirecting…" : "Go Pro"}
    </button>
  );
}
