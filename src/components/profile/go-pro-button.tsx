"use client";

import React from "react";

export default function GoProButton({ dbUserId }: { dbUserId?: string }) {
  const [loading, setLoading] = React.useState(false);

  async function handleClick() {
    try {
      setLoading(true);
      // Navigate to /checkout which will initiate the session server-side
      window.location.href = "/checkout";
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
