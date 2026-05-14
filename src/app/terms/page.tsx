export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="paper-card rounded-2xl p-6 sm:p-8">
        <h1 className="text-3xl font-semibold sm:text-4xl">Terms of Service</h1>
        <p className="mt-2 text-sm text-black/65 dark:text-white/70">
          Last updated: 4/25/2026
        </p>
        <p className="mt-4 text-sm text-black/75 dark:text-white/80">
          Welcome to MeshyLinks. By accessing or using this platform, you agree
          to the following terms.
        </p>
      </header>

      <section className="paper-card rounded-2xl p-6 text-sm leading-relaxed text-black/80 dark:text-white/85 sm:p-8">
        <div className="space-y-5">
          <div>
            <h2 className="text-base font-semibold">1. Eligibility</h2>
            <p className="mt-1">
              You must be at least 18 years old to use MeshyLinks. By using the
              platform, you confirm that you meet this requirement.
            </p>
          </div>

          <div>
            <h2 className="text-base font-semibold">2. SMS Notifications</h2>
            <p className="mt-1">
              By providing your phone number and opting into SMS notifications,
              you agree to receive transactional text messages from MeshyLinks
              related to account activity, invitations, authentication, and
              service notifications. Message frequency varies. Message and data
              rates may apply. Reply STOP to unsubscribe or HELP for assistance.
            </p>
          </div>

          <div>
            <h2 className="text-base font-semibold">
              3. User Content &amp; Responsibility
            </h2>
            <p className="mt-1">
              Users are solely responsible for any content, connections, or
              information they submit.
            </p>
            <p className="mt-2">
              By creating or confirming a connection, you represent that:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>The information is accurate to the best of your knowledge</li>
              <li>You have the right to share this information</li>
              <li>You are not violating any laws or rights of others</li>
            </ul>
            <p className="mt-2">
              MeshyLinks does not verify user-submitted content.
            </p>
          </div>

          <div>
            <h2 className="text-base font-semibold">
              4. Connection Verification &amp; Consent
            </h2>
            <p className="mt-1">
              Connections between individuals are only made visible after
              confirmation by both parties.
            </p>
            <p className="mt-2">
              By confirming a connection, you consent to the display of that
              connection on the platform.
            </p>
            <p className="mt-2">
              Users may remove connections involving them at any time.
            </p>
          </div>

          <div>
            <h2 className="text-base font-semibold">5. Prohibited Conduct</h2>
            <p className="mt-1">You agree not to:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Post false, misleading, or defamatory information</li>
              <li>Harass, threaten, or harm others</li>
              <li>Impersonate another person</li>
              <li>Use the platform for unlawful purposes</li>
            </ul>
          </div>

          <div>
            <h2 className="text-base font-semibold">
              6. Content Removal &amp; Account Termination
            </h2>
            <p className="mt-1">
              MeshyLinks reserves the right to remove any content or suspend
              accounts at its sole discretion.
            </p>
          </div>

          <div>
            <h2 className="text-base font-semibold">
              7. Reporting &amp; Takedown Requests
            </h2>
            <p className="mt-1">
              If you believe content about you is inaccurate or violates your
              rights, you may request removal through the Report / Remove Me
              page.
            </p>
          </div>

          <div>
            <h2 className="text-base font-semibold">8. Disclaimer</h2>
            <p className="mt-1">
              MeshyLinks provides a platform for user-generated content and does
              not guarantee the accuracy, completeness, or reliability of any
              information.
            </p>
            <p className="mt-2">Use the platform at your own risk.</p>
          </div>

          <div>
            <h2 className="text-base font-semibold">
              9. Limitation of Liability
            </h2>
            <p className="mt-1">
              To the fullest extent permitted by law, MeshyLinks is not liable
              for any damages arising from the use of the platform or
              user-generated content.
            </p>
          </div>

          <div>
            <h2 className="text-base font-semibold">
              10. Changes to These Terms
            </h2>
            <p className="mt-1">
              We may update these Terms at any time. Continued use of the
              platform constitutes acceptance of the updated Terms.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
