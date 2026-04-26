"use client";

import { FormEvent, useState } from "react";
import { useSearchParams } from "next/navigation";

type ReportFormData = {
  name: string;
  email: string;
  link: string;
  reason: string;
};

const initialForm: ReportFormData = {
  name: "",
  email: "",
  link: "",
  reason: "",
};

export default function ReportPage() {
  const searchParams = useSearchParams();
  const prefilledLink = searchParams.get("link") ?? "";
  const prefilledReason = searchParams.get("reason") ?? "";
  const [form, setForm] = useState<ReportFormData>({
    ...initialForm,
    link: prefilledLink,
    reason: prefilledReason,
  });
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(false);
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/report", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });

      const body = (await response.json()) as { error?: string; success?: boolean };

      if (!response.ok || !body.success) {
        setError(body.error ?? "Could not submit your request right now.");
        return;
      }

      setSubmitted(true);
      setForm(initialForm);
    } catch {
      setError("Could not submit your request right now.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="paper-card rounded-2xl p-6 sm:p-8">
        <h1 className="text-3xl font-semibold sm:text-4xl">Report / Remove Me</h1>
        <p className="mt-2 text-sm text-black/65 dark:text-white/70">
          Use this form to report inaccurate content or request removal.
        </p>
      </header>

      <section className="paper-card rounded-2xl p-6 sm:p-8">
        {submitted ? (
          <p className="rounded-xl border border-green-300/60 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-700/50 dark:bg-green-950/30 dark:text-green-200">
            Thanks. Your request has been received and will be reviewed.
          </p>
        ) : null}
        {error ? (
          <p className="mt-2 rounded-xl border border-red-300/60 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-700/50 dark:bg-red-950/30 dark:text-red-200">
            {error}
          </p>
        ) : null}

        <form onSubmit={onSubmit} className="mt-1 space-y-4">
          <label className="block text-sm font-semibold">
            Your name
            <input
              type="text"
              required
              value={form.name}
              onChange={(event) =>
                setForm((current) => ({ ...current, name: event.target.value }))
              }
              className="mt-1.5 w-full rounded-xl border border-[var(--border-soft)] bg-transparent px-3 py-2.5 font-normal outline-none"
            />
          </label>

          <label className="block text-sm font-semibold">
            Your email
            <input
              type="email"
              required
              value={form.email}
              onChange={(event) =>
                setForm((current) => ({ ...current, email: event.target.value }))
              }
              className="mt-1.5 w-full rounded-xl border border-[var(--border-soft)] bg-transparent px-3 py-2.5 font-normal outline-none"
            />
          </label>

          <label className="block text-sm font-semibold">
            Link to profile or connection
            <input
              type="text"
              required
              value={form.link}
              onChange={(event) =>
                setForm((current) => ({ ...current, link: event.target.value }))
              }
              className="mt-1.5 w-full rounded-xl border border-[var(--border-soft)] bg-transparent px-3 py-2.5 font-normal outline-none"
              placeholder="/profile or connection URL"
            />
          </label>

          <label className="block text-sm font-semibold">
            Reason for report/removal
            <textarea
              required
              rows={5}
              value={form.reason}
              onChange={(event) =>
                setForm((current) => ({ ...current, reason: event.target.value }))
              }
              className="mt-1.5 w-full rounded-xl border border-[var(--border-soft)] bg-transparent px-3 py-2.5 font-normal outline-none"
            />
          </label>

          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-full bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-white transition hover:brightness-95"
          >
            {isSubmitting ? "Submitting..." : "Submit"}
          </button>
        </form>
      </section>
    </div>
  );
}
