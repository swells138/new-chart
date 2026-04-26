export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="paper-card rounded-2xl p-6 sm:p-8">
        <h1 className="text-3xl font-semibold sm:text-4xl">Privacy Policy</h1>
        <p className="mt-2 text-sm text-black/65 dark:text-white/70">Last updated: 4/25/2026</p>
        <p className="mt-4 text-sm text-black/75 dark:text-white/80">
          We keep privacy simple: only confirmed connections are shown, and users can remove their own connections at any time.
        </p>
      </header>

      <section className="paper-card rounded-2xl p-6 text-sm leading-relaxed text-black/80 dark:text-white/85 sm:p-8">
        <div className="space-y-4">
          <p>
            MeshyLinks collects account details, profile information, and connection data that users choose to submit.
            We use this information to run the platform, show your network, improve safety, and respond to support or moderation requests.
          </p>
          <p>
            Connections are private until confirmed by both people. Once confirmed, they may appear on the platform according
            to your settings and product behavior.
          </p>
          <p>
            If information about you is inaccurate or you want content removed, use the Report / Remove Me page. We review requests
            as quickly as possible.
          </p>
          <p>
            We may update this policy over time. Continuing to use MeshyLinks after updates means you accept the revised policy.
          </p>
        </div>
      </section>
    </div>
  );
}
