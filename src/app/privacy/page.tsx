import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "Privacy practices for MeshyLinks accounts, invitations, SMS communications, and user-generated connection data.",
  openGraph: {
    title: "Privacy Policy | MeshyLinks",
    description:
      "How MeshyLinks handles account information, invitations, SMS communications, and privacy rights.",
    url: "/privacy",
  },
};

const sections = [
  {
    title: "Information We Collect",
    body: [
      "MeshyLinks collects information you provide when you create an account, build a profile, add connection details, send invitations, contact support, or use account and safety features.",
      "This may include your name, username or handle, profile details, account identifiers, submitted connection information, contact details you provide, device/session information, and support or moderation messages.",
    ],
  },
  {
    title: "Email Addresses",
    body: [
      "We use email addresses for account access, service notifications, support, invitations, safety messages, and product-related transactional communications.",
      "If a user manually invites someone by email, MeshyLinks may send a transactional invite to the address the user entered.",
    ],
  },
  {
    title: "Phone Numbers and SMS",
    body: [
      "Phone numbers may be used for transactional SMS messages related to invitations, verification, account activity, connection approvals, and service notifications.",
      "Users manually send invitations. Recipients may receive SMS invites only when a MeshyLinks user enters a phone number and confirms they have permission to contact that person.",
      "MeshyLinks does not sell phone numbers, purchase contact lists, scrape contacts, or provide bulk contact-list upload tools for mass texting.",
    ],
  },
  {
    title: "Profile and Connection Data",
    body: [
      "MeshyLinks stores user-generated profile and connection data so users can map, verify, and manage their connection network.",
      "Private placeholder connections are not treated as verified public connections unless the invited person joins and confirms or manages the connection through the product flow.",
    ],
  },
  {
    title: "Invitation System",
    body: [
      "Users are responsible for ensuring they have permission to contact recipients before sending an invitation through MeshyLinks.",
      "Invite links and tokens are generated so recipients can review, claim, accept, decline, or manage connection information associated with them.",
      "Invitation delivery events, errors, opt-out events, and related audit information may be stored to operate the service and prevent abuse.",
    ],
  },
  {
    title: "Cookies, Sessions, and Authentication",
    body: [
      "MeshyLinks and its authentication providers use cookies, session storage, and similar technologies to keep users signed in, protect accounts, remember preferences, and secure the service.",
      "Some cookies or identifiers are necessary for authentication, security, analytics, or payment flows.",
    ],
  },
  {
    title: "Data Storage and Security",
    body: [
      "We use reasonable technical and organizational safeguards to protect information, including access controls, authentication, and secure third-party infrastructure.",
      "No online service can guarantee absolute security. If you believe your account or information is at risk, contact us promptly.",
    ],
  },
  {
    title: "Third-Party Services",
    body: [
      "MeshyLinks may use service providers to operate the platform, including Twilio for SMS delivery and opt-out processing, Clerk for authentication, Stripe for payments, Vercel for hosting and analytics, and email providers for transactional email.",
      "These providers process information as needed to perform services for MeshyLinks and are not authorized by us to sell recipient phone numbers.",
    ],
  },
  {
    title: "Opt-Out and Privacy Rights",
    body: [
      "SMS recipients can reply STOP to opt out at any time. They may reply START or follow available product flows to opt back in where supported.",
      "Users and recipients may contact MeshyLinks to request access, correction, deletion, or removal of information associated with them, subject to identity, safety, legal, and operational requirements.",
    ],
  },
  {
    title: "Contact",
    body: [
      "For privacy questions, support requests, or removal requests, contact support@meshylinks.com or use the Contact page.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="paper-card rounded-2xl p-6 sm:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--accent)]">
          MeshyLinks legal
        </p>
        <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">
          Privacy Policy
        </h1>
        <p className="mt-2 text-sm text-black/65 dark:text-white/70">
          Last updated: May 15, 2026
        </p>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-black/75 dark:text-white/80">
          This policy explains how MeshyLinks handles account information,
          manually sent invitations, SMS communications, and user-generated
          connection data.
        </p>
      </header>

      <section className="paper-card rounded-2xl p-6 text-sm leading-relaxed text-black/80 dark:text-white/85 sm:p-8">
        <div className="space-y-7">
          {sections.map((section) => (
            <div key={section.title}>
              <h2 className="text-base font-semibold text-black dark:text-white">
                {section.title}
              </h2>
              <div className="mt-2 space-y-2">
                {section.body.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-8 border-t border-[var(--border-soft)] pt-5 text-xs text-black/60 dark:text-white/65">
          This page is provided for transparency and does not create additional
          guarantees beyond the product behavior and applicable terms. For help,
          visit <Link href="/contact" className="font-semibold underline">Contact</Link>.
        </p>
      </section>
    </div>
  );
}
