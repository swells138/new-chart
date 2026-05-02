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
    <div className="w-full">
      <div className="rounded-2xl bg-linear-to-br from-white/5 to-black/20 backdrop-blur-sm border border-white/6 p-5 shadow-md text-white">
        <div className="flex items-start gap-4">
          <div className="shrink-0 h-11 w-11 rounded-lg bg-violet-600/20 flex items-center justify-center">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="text-violet-300"
            >
              <path
                d="M12 2l2.9 6.59L22 10.17l-5 4.87L18.8 22 12 18.56 5.2 22 7 15.04 2 10.17l7.1-1.58L12 2z"
                fill="currentColor"
              />
            </svg>
          </div>

          <div className="flex-1">
            <h3 className="text-lg font-semibold">Upgrade to Pro</h3>
            <p className="mt-1 text-sm text-white/70">
              Unlock more of the chart
            </p>

            <ul className="mt-3 space-y-2 text-sm text-white/75">
              <li className="flex items-center gap-2">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  className="shrink-0"
                >
                  <path
                    d="M20 6L9 17l-5-5"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Paths — advanced pathfinding and route options
              </li>
              <li className="flex items-center gap-2">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  className="shrink-0"
                >
                  <path
                    d="M20 6L9 17l-5-5"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Profiles — view full profiles and additional details
              </li>
              <li className="flex items-center gap-2">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  className="shrink-0"
                >
                  <path
                    d="M20 6L9 17l-5-5"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Visibility — increase discoverability and map prominence
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-4">
          <button
            className="w-full rounded-lg py-3 px-4 text-sm font-semibold text-white bg-[#ff7b6b] shadow-lg transition transform hover:-translate-y-0.5 hover:scale-[1.01] hover:shadow-[0_12px_30px_rgba(255,123,107,0.18)] focus:outline-none focus:ring-4 focus:ring-[#ff7b6b]/30 disabled:opacity-60 disabled:cursor-not-allowed"
            onClick={handleClick}
            disabled={loading}
            type="button"
            aria-label="Upgrade to Pro"
          >
            {loading ? "Redirecting…" : "Upgrade to Pro"}
          </button>
        </div>
      </div>
    </div>
  );
}
