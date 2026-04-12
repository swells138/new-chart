"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface InviteData {
  placeholderId: string;
  ownerName: string;
  ownerHandle: string | null;
  relationshipType: string;
  note: string | null;
  claimStatus: string;
}

interface PageProps {
  params: Promise<{ token: string }>;
}

export default function InvitePage({ params }: PageProps) {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [invite, setInvite] = useState<InviteData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [responding, setResponding] = useState(false);
  const [done, setDone] = useState<"approved" | "denied" | null>(null);

  useEffect(() => {
    params.then(({ token: t }) => setToken(t));
  }, [params]);

  useEffect(() => {
    if (!token) return;

    fetch(`/api/invite/${token}`)
      .then((res) => res.json())
      .then((body: { invite?: InviteData; error?: string }) => {
        if (body.error) {
          setError(body.error);
        } else if (body.invite) {
          setInvite(body.invite);
        }
      })
      .catch(() => setError("Could not load this invite. Please try again."))
      .finally(() => setLoading(false));
  }, [token]);

  async function respond(action: "approve" | "deny") {
    if (!token) return;
    setResponding(true);
    setError(null);

    try {
      const res = await fetch(`/api/invite/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });

      const body = (await res.json()) as {
        result?: string;
        error?: string;
      };

      if (res.status === 401) {
        // Not signed in — redirect to login with return URL
        router.push(`/login?redirect=/invite/${token}`);
        return;
      }

      if (!res.ok || body.error) {
        setError(body.error ?? "Something went wrong. Please try again.");
        return;
      }

      setDone(action === "approve" ? "approved" : "denied");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setResponding(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-black/60 dark:text-white/60">Loading invite…</p>
      </div>
    );
  }

  if (error && !invite) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="paper-card max-w-md rounded-2xl p-8 text-center">
          <p className="text-4xl">🔗</p>
          <h1 className="mt-4 text-xl font-bold">Invite unavailable</h1>
          <p className="mt-2 text-sm text-black/65 dark:text-white/65">{error}</p>
          <button
            type="button"
            onClick={() => router.push("/")}
            className="mt-6 rounded-xl bg-[var(--accent)] px-6 py-2.5 text-sm font-semibold text-white"
          >
            Go home
          </button>
        </div>
      </div>
    );
  }

  if (done === "approved") {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="paper-card max-w-md rounded-2xl p-8 text-center">
          <p className="text-5xl">✨</p>
          <h1 className="mt-4 text-xl font-bold">You&apos;re connected!</h1>
          <p className="mt-2 text-sm text-black/65 dark:text-white/65">
            Your connection with <span className="font-semibold">{invite?.ownerName}</span> is now live
            on your private chart.
          </p>
          <p className="mt-1 text-xs text-black/50 dark:text-white/50">
            It&apos;s only visible to both of you until you choose to make it public. 🔒
          </p>
          <button
            type="button"
            onClick={() => router.push("/map")}
            className="mt-6 rounded-xl bg-[var(--accent)] px-6 py-2.5 text-sm font-semibold text-white"
          >
            Open my chart
          </button>
        </div>
      </div>
    );
  }

  if (done === "denied") {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="paper-card max-w-md rounded-2xl p-8 text-center">
          <p className="text-5xl">🙅</p>
          <h1 className="mt-4 text-xl font-bold">Invite declined</h1>
          <p className="mt-2 text-sm text-black/65 dark:text-white/65">
            You&apos;ve declined this connection. No hard feelings.
          </p>
          <button
            type="button"
            onClick={() => router.push("/")}
            className="mt-6 rounded-xl bg-[var(--accent)] px-6 py-2.5 text-sm font-semibold text-white"
          >
            Go home
          </button>
        </div>
      </div>
    );
  }

  if (!invite) return null;

  const displayHandle = invite.ownerHandle ? `@${invite.ownerHandle}` : null;

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="paper-card w-full max-w-md rounded-2xl p-8">
        {/* Header */}
        <div className="text-center">
          <p className="text-5xl">👀</p>
          <h1 className="mt-4 text-2xl font-bold leading-tight">
            Someone added you to their chart
          </h1>
          <p className="mt-2 text-sm text-black/60 dark:text-white/60">
            This is private — only visible to the two of you unless you both choose otherwise.
          </p>
        </div>

        {/* Invite card */}
        <div className="mt-6 rounded-xl border border-[var(--border-soft)] bg-white/60 p-5 dark:bg-black/20">
          <p className="text-lg font-semibold">
            {invite.ownerName}
            {displayHandle ? (
              <span className="ml-2 text-sm font-normal text-black/55 dark:text-white/55">
                {displayHandle}
              </span>
            ) : null}
          </p>
          <p className="mt-1 text-xs uppercase tracking-wider text-[var(--accent)]">
            added you as: {invite.relationshipType}
          </p>
          {invite.note ? (
            <p className="mt-2 text-sm italic text-black/70 dark:text-white/70">
              &quot;{invite.note}&quot;
            </p>
          ) : null}
        </div>

        {/* Privacy note */}
        <div className="mt-4 rounded-xl border border-[var(--border-soft)] bg-black/[0.03] p-3 dark:bg-white/5">
          <p className="text-xs text-black/60 dark:text-white/60">
            🔒 <strong>Only you and {invite.ownerName} can see this connection.</strong> Nothing is
            ever made public without your explicit consent.
          </p>
        </div>

        {/* Error */}
        {error ? (
          <p className="mt-3 text-sm text-red-700 dark:text-red-400">{error}</p>
        ) : null}

        {/* Actions */}
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={() => respond("approve")}
            disabled={responding}
            className="flex-1 rounded-xl bg-[var(--accent)] py-3 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-60"
          >
            {responding ? "Saving…" : "Accept connection ✓"}
          </button>
          <button
            type="button"
            onClick={() => respond("deny")}
            disabled={responding}
            className="flex-1 rounded-xl border border-[var(--border-soft)] py-3 text-sm font-semibold transition hover:bg-black/5 disabled:opacity-60 dark:hover:bg-white/10"
          >
            Decline
          </button>
        </div>

        <p className="mt-4 text-center text-xs text-black/45 dark:text-white/45">
          Not sure who this is? You can safely decline — no pressure.
        </p>
      </div>
    </div>
  );
}
