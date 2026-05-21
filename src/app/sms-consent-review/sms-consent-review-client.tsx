"use client";

// TEMP A2P REVIEW PAGE - SAFE TO DELETE AFTER APPROVAL

import { useState } from "react";
import Link from "next/link";
import {
  INVITE_ACTION_DISCLOSURE_TEXT,
  INVITE_CONSENT_HELPER_TEXT,
  SMS_CONSENT_TEXT,
} from "@/components/ui/sms-consent-checkbox";
import {
  demoInviteDefaults,
  demoNodes,
  sampleSmsMessages,
} from "./demo-data";

const missingOriginatingNumber =
  "Set TWILIO_FROM_NUMBER in production so reviewers can see the exact Twilio number attached to this A2P campaign.";

function DemoChart() {
  const center = { x: 50, y: 52 };

  return (
    <section className="paper-card overflow-hidden rounded-2xl p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--accent)]">
            Fake private chart UI
          </p>
          <h2 className="mt-1 text-xl font-semibold">Demo connection chart</h2>
        </div>
        <span className="rounded-full border border-[var(--border-soft)] px-3 py-1 text-xs font-semibold text-black/60 dark:text-white/65">
          Static demo data
        </span>
      </div>

      <div className="mt-5 rounded-2xl border border-white/10 bg-[#120a19] p-4 text-white shadow-inner">
        <div className="relative h-[340px] min-h-[340px] overflow-hidden rounded-xl border border-white/10 bg-[radial-gradient(circle_at_50%_46%,rgba(255,143,132,0.16),transparent_30%),linear-gradient(145deg,#1d1028,#0d0712)]">
          <svg
            aria-hidden="true"
            className="absolute inset-0 h-full w-full"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            {demoNodes
              .filter((node) => node.id !== "alex")
              .map((node) => (
                <path
                  key={node.id}
                  d={`M ${center.x} ${center.y} Q ${(center.x + node.x) / 2} ${
                    (center.y + node.y) / 2 - 8
                  } ${node.x} ${node.y}`}
                  fill="none"
                  stroke={node.color}
                  strokeOpacity="0.5"
                  strokeWidth="0.7"
                />
              ))}
          </svg>

          <div
            className="absolute left-1/2 top-[52%] z-10 flex h-24 w-24 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-white/10 text-center shadow-2xl backdrop-blur"
            style={{ boxShadow: "0 0 48px rgba(255,143,132,0.28)" }}
          >
            <div>
              <p className="text-sm font-bold">Alex</p>
              <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-white/55">
                Sender
              </p>
            </div>
          </div>

          {demoNodes.map((node) => (
            <article
              key={node.id}
              className="absolute z-20 w-[150px] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-white/12 bg-white/10 p-3 shadow-xl backdrop-blur"
              style={{
                left: `${node.x}%`,
                top: `${node.y}%`,
                boxShadow: `0 0 0 1px ${node.color}22 inset`,
              }}
            >
              <div className="flex items-center gap-2">
                <span
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: node.color }}
                />
                <p className="min-w-0 truncate text-sm font-semibold">
                  {node.name}
                </p>
              </div>
              <p className="mt-1 text-xs text-white/62">{node.status}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                  style={{
                    backgroundColor: `${node.color}24`,
                    border: `1px solid ${node.color}44`,
                    color: node.color,
                  }}
                >
                  {node.relationship}
                </span>
                <span className="rounded-full border border-white/15 px-2 py-0.5 text-[10px] font-semibold text-white/62">
                  {node.approvalState}
                </span>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function DemoInviteForm() {
  const [recipientName, setRecipientName] = useState(
    demoInviteDefaults.recipientName,
  );
  const [phoneNumber, setPhoneNumber] = useState(
    demoInviteDefaults.phoneNumber,
  );
  const [relationshipType, setRelationshipType] = useState(
    demoInviteDefaults.relationshipType,
  );
  const [note, setNote] = useState(demoInviteDefaults.note);
  const [hasConsent, setHasConsent] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  return (
    <section className="paper-card rounded-2xl p-4 sm:p-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--accent)]">
          Fake invite form
        </p>
        <h2 className="mt-1 text-xl font-semibold">Manual one-time invite</h2>
      </div>

      <form
        className="mt-5 grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          setSuccessMessage(
            `Demo only: A one-time invitation would be sent to ${recipientName}.`,
          );
        }}
      >
        <label className="grid gap-1 text-sm font-semibold">
          Recipient name
          <input
            value={recipientName}
            onChange={(event) => setRecipientName(event.target.value)}
            className="rounded-xl border border-[var(--border-soft)] bg-white/70 px-3 py-2 font-normal outline-none focus:border-[var(--accent)] dark:bg-black/20"
          />
        </label>

        <label className="grid gap-1 text-sm font-semibold">
          Recipient phone number
          <input
            value={phoneNumber}
            onChange={(event) => setPhoneNumber(event.target.value)}
            className="rounded-xl border border-[var(--border-soft)] bg-white/70 px-3 py-2 font-normal outline-none focus:border-[var(--accent)] dark:bg-black/20"
          />
        </label>

        <label className="grid gap-1 text-sm font-semibold">
          Relationship type
          <select
            value={relationshipType}
            onChange={(event) => setRelationshipType(event.target.value)}
            className="rounded-xl border border-[var(--border-soft)] bg-white/70 px-3 py-2 font-normal outline-none focus:border-[var(--accent)] dark:bg-black/20"
          >
            <option>Friend</option>
            <option>Dating</option>
            <option>Coworker</option>
            <option>Family</option>
            <option>Known contact</option>
          </select>
        </label>

        <label className="grid gap-1 text-sm font-semibold">
          Optional note
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={3}
            className="resize-none rounded-xl border border-[var(--border-soft)] bg-white/70 px-3 py-2 font-normal outline-none focus:border-[var(--accent)] dark:bg-black/20"
          />
        </label>

        <label className="flex items-start gap-3 rounded-2xl border border-[var(--border-soft)] bg-white/70 p-4 text-sm dark:bg-black/20">
          <input
            type="checkbox"
            checked={hasConsent}
            onChange={(event) => setHasConsent(event.target.checked)}
            className="mt-1 h-4 w-4"
            required
          />
          <span className="leading-relaxed text-black/80 dark:text-white/85">
            {SMS_CONSENT_TEXT}
            <span className="mt-2 block text-xs text-black/62 dark:text-white/68">
              {INVITE_CONSENT_HELPER_TEXT}
            </span>
          </span>
        </label>

        <div>
          <button
            type="submit"
            disabled={!hasConsent}
            className="rounded-full bg-[var(--accent)] px-5 py-2.5 text-sm font-bold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-55"
          >
            Invite User
          </button>
          <p className="mt-3 max-w-2xl text-xs leading-relaxed text-black/65 dark:text-white/70">
            {INVITE_ACTION_DISCLOSURE_TEXT}
          </p>
        </div>

        {successMessage ? (
          <p className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-700 dark:text-emerald-200">
            {successMessage}
          </p>
        ) : null}
      </form>
    </section>
  );
}

export function SmsConsentReviewClient({
  originatingNumber,
}: {
  originatingNumber: string | null;
}) {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="paper-card rounded-2xl p-5 sm:p-8">
        <p className="inline-flex rounded-full border border-[var(--accent)]/35 bg-[var(--accent)]/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-[var(--accent)]">
          Demo Review Page — No Real Messages Sent
        </p>
        <h1 className="mt-4 text-3xl font-semibold sm:text-4xl">
          MeshyLinks SMS Consent Review
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-black/75 dark:text-white/80">
          This page shows how MeshyLinks users manually send one-time
          invitation messages to friends or known contacts. This demo uses fake
          users and does not send real SMS messages.
        </p>
      </header>

      <section className="paper-card rounded-2xl p-4 text-sm leading-relaxed sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--accent)]">
              A2P CTA submitted for review
            </p>
            <h2 className="mt-1 text-xl font-semibold">
              Manual one-time invitation opt-in flow
            </h2>
          </div>
          <div className="rounded-xl border border-[var(--border-soft)] px-3 py-2 text-xs font-semibold text-black/70 dark:text-white/72">
            Originating SMS number:{" "}
            <span className="text-black dark:text-white">
              {originatingNumber ?? "Configured Twilio campaign number"}
            </span>
          </div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-[var(--border-soft)] bg-white/55 p-4 dark:bg-black/20">
            <h3 className="text-sm font-semibold">Consent method</h3>
            <p className="mt-2 text-black/72 dark:text-white/78">
              A logged-in MeshyLinks user manually enters a known contact phone
              number, confirms they have permission to contact that
              recipient, and clicks Invite User. No SMS is sent unless the
              consent checkbox is selected.
            </p>
          </div>
          <div className="rounded-xl border border-[var(--border-soft)] bg-white/55 p-4 dark:bg-black/20">
            <h3 className="text-sm font-semibold">Program details</h3>
            <p className="mt-2 text-black/72 dark:text-white/78">
              Brand: MeshyLinks. Product: private connection chart invitations
              and transactional account messages. Message frequency varies for
              account notices and is one message per manual invitation.
              Message and data rates may apply. Reply HELP for help or STOP to
              opt out.
            </p>
          </div>
        </div>
        {originatingNumber ? null : (
          <p className="mt-3 text-xs font-semibold text-amber-700 dark:text-amber-300">
            {missingOriginatingNumber}
          </p>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
        <DemoChart />
        <DemoInviteForm />
      </div>

      <section className="paper-card rounded-2xl p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--accent)]">
              Sample SMS messages
            </p>
            <h2 className="mt-1 text-xl font-semibold">
              Transactional message examples
            </h2>
          </div>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {sampleSmsMessages.map((message) => (
            <article
              key={message.label}
              className="rounded-xl border border-[var(--border-soft)] bg-white/55 p-4 dark:bg-black/20"
            >
              <h3 className="text-sm font-semibold">{message.label}</h3>
              <p className="mt-3 text-sm leading-relaxed text-black/72 dark:text-white/78">
                {message.body}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="paper-card rounded-2xl p-4 text-sm sm:p-6">
        <h2 className="text-xl font-semibold">Review links</h2>
        <div className="mt-3 flex flex-wrap gap-3">
          <Link className="font-semibold text-[var(--accent)] underline" href="/privacy">
            Privacy Policy
          </Link>
          <Link className="font-semibold text-[var(--accent)] underline" href="/terms">
            Terms of Service
          </Link>
          <Link className="font-semibold text-[var(--accent)] underline" href="/privacy">
            SMS Messaging Policy
          </Link>
        </div>
      </section>

      <footer className="rounded-2xl border border-[var(--border-soft)] bg-black/[0.03] p-4 text-sm leading-relaxed text-black/70 dark:bg-white/[0.04] dark:text-white/72 sm:p-5">
        MeshyLinks SMS invitations are user-initiated, one-to-one, and
        transactional. Recipients may reply STOP to opt out. MeshyLinks does
        not send bulk promotional SMS campaigns.
      </footer>
    </div>
  );
}
