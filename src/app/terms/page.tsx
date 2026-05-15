import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "Terms for using MeshyLinks, including user responsibilities, invitation consent, prohibited conduct, and account termination rights.",
  openGraph: {
    title: "Terms of Service | MeshyLinks",
    description:
      "MeshyLinks user responsibilities, invitation consent rules, prohibited conduct, and service terms.",
    url: "/terms",
  },
};

const sections = [
  {
    title: "1. Eligibility and Accounts",
    body: [
      "You must be at least 18 years old to use MeshyLinks. You are responsible for your account activity, the accuracy of information you submit, and keeping your login credentials secure.",
    ],
  },
  {
    title: "2. User Responsibilities",
    body: [
      "You are responsible for profile details, connection information, invitation recipient details, notes, and other content you submit.",
      "Do not submit information that you know is false, misleading, invasive, defamatory, or unlawful.",
    ],
  },
  {
    title: "3. Invitation Consent",
    body: [
      "MeshyLinks lets users manually invite people by email or SMS. You must have permission to contact each recipient before sending an invitation.",
      "You may not use MeshyLinks to send unwanted messages, bulk outreach, scraped contact data, purchased lists, or automated marketing campaigns.",
    ],
  },
  {
    title: "4. Prohibited Conduct",
    body: [
      "You may not harass, threaten, abuse, defame, stalk, impersonate, deceive, or harm another person through MeshyLinks.",
      "You may not use MeshyLinks for unlawful purposes, to violate another person’s rights, to interfere with service security, or to attempt unauthorized access to any account or system.",
    ],
  },
  {
    title: "5. Submitted Connections",
    body: [
      "Connections and placeholder profiles are user-generated. You are responsible for ensuring that submitted connections are accurate to the best of your knowledge and that you have the right to submit them.",
      "Recipients may accept, decline, manage, report, or request removal of connection information involving them.",
    ],
  },
  {
    title: "6. SMS and Service Messages",
    body: [
      "Transactional SMS messages may include invitations, verification messages, account notices, connection approvals, and service notifications. Message frequency varies. Message and data rates may apply.",
      "SMS recipients can reply STOP to opt out or HELP for assistance.",
    ],
  },
  {
    title: "7. Content Review and Account Termination",
    body: [
      "MeshyLinks may remove content, limit features, suspend accounts, terminate accounts, or block invitations when we believe use may violate these Terms, create safety risks, or harm the service.",
    ],
  },
  {
    title: "8. Third-Party Services",
    body: [
      "MeshyLinks may rely on third-party providers for authentication, hosting, payments, analytics, email, and SMS delivery. Your use of those features may also be subject to the applicable provider’s terms.",
    ],
  },
  {
    title: "9. Disclaimers",
    body: [
      "MeshyLinks is provided on an as-is and as-available basis. We do not guarantee that user-generated information is accurate, complete, available, or suitable for any particular purpose.",
    ],
  },
  {
    title: "10. Limitation of Liability",
    body: [
      "To the fullest extent permitted by law, MeshyLinks is not liable for indirect, incidental, special, consequential, exemplary, or punitive damages, or for loss of data, profits, goodwill, or business opportunities arising from use of the service.",
    ],
  },
  {
    title: "11. Changes",
    body: [
      "We may update these Terms from time to time. Continued use of MeshyLinks after updates means you accept the revised Terms.",
    ],
  },
  {
    title: "12. Contact",
    body: [
      "For questions about these Terms, contact support@meshylinks.com or use the Contact page.",
    ],
  },
];

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="paper-card rounded-2xl p-6 sm:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--accent)]">
          MeshyLinks legal
        </p>
        <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">
          Terms of Service
        </h1>
        <p className="mt-2 text-sm text-black/65 dark:text-white/70">
          Last updated: May 15, 2026
        </p>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-black/75 dark:text-white/80">
          These Terms describe the responsibilities that come with using
          MeshyLinks, including consent requirements for invitations and rules
          for user-generated connection data.
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
          Need help with a connection, invitation, or removal request? Visit{" "}
          <Link href="/contact" className="font-semibold underline">Contact</Link>.
        </p>
      </section>
    </div>
  );
}
