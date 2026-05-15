import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Contact MeshyLinks support for account, privacy, invitation, SMS opt-out, and connection removal questions.",
  openGraph: {
    title: "Contact | MeshyLinks",
    description:
      "Get help with MeshyLinks account, privacy, invitation, SMS, and connection removal requests.",
    url: "/contact",
  },
};

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="paper-card rounded-2xl p-6 sm:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--accent)]">
          Support
        </p>
        <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">
          Contact MeshyLinks
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-black/75 dark:text-white/80">
          For account help, invitation questions, privacy requests, SMS
          opt-outs, or connection removal requests, reach the MeshyLinks team.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_0.8fr]">
        <section className="paper-card rounded-2xl p-6 sm:p-8">
          <h2 className="text-lg font-semibold">Send a message</h2>
          <form className="mt-5 space-y-4">
            <label className="block text-sm font-semibold">
              Name
              <input
                type="text"
                name="name"
                autoComplete="name"
                className="mt-2 w-full rounded-xl border border-[var(--border-soft)] bg-white/70 px-3 py-2 text-sm outline-none focus:border-[var(--accent)] dark:bg-black/25"
              />
            </label>
            <label className="block text-sm font-semibold">
              Email
              <input
                type="email"
                name="email"
                autoComplete="email"
                className="mt-2 w-full rounded-xl border border-[var(--border-soft)] bg-white/70 px-3 py-2 text-sm outline-none focus:border-[var(--accent)] dark:bg-black/25"
              />
            </label>
            <label className="block text-sm font-semibold">
              Topic
              <select
                name="topic"
                className="mt-2 w-full rounded-xl border border-[var(--border-soft)] bg-white/70 px-3 py-2 text-sm outline-none focus:border-[var(--accent)] dark:bg-black/25"
                defaultValue="support"
              >
                <option value="support">Account support</option>
                <option value="privacy">Privacy request</option>
                <option value="sms">SMS or invite question</option>
                <option value="removal">Report or removal request</option>
              </select>
            </label>
            <label className="block text-sm font-semibold">
              Message
              <textarea
                name="message"
                rows={6}
                className="mt-2 w-full resize-y rounded-xl border border-[var(--border-soft)] bg-white/70 px-3 py-2 text-sm outline-none focus:border-[var(--accent)] dark:bg-black/25"
              />
            </label>
            <button
              type="button"
              className="rounded-full bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-white transition hover:brightness-95"
            >
              Send message
            </button>
            <p className="text-xs leading-relaxed text-black/60 dark:text-white/65">
              This form is a support UI placeholder. For now, email the support
              address directly for the fastest response.
            </p>
          </form>
        </section>

        <aside className="paper-card rounded-2xl p-6 text-sm leading-relaxed text-black/75 dark:text-white/80 sm:p-8">
          <h2 className="text-lg font-semibold text-black dark:text-white">
            Contact information
          </h2>
          <div className="mt-4 space-y-4">
            <p>
              Support email:{" "}
              <a
                href="mailto:support@meshylinks.com"
                className="font-semibold text-[var(--accent)] underline"
              >
                support@meshylinks.com
              </a>
            </p>
            <p>
              SMS recipients can reply STOP to opt out of MeshyLinks text
              messages at any time.
            </p>
            <p>
              For removal or safety issues, you can also use the{" "}
              <Link href="/report" className="font-semibold underline">
                Report / Remove Me
              </Link>{" "}
              page.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
