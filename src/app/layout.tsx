import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Caveat, Nunito, Playfair_Display } from "next/font/google";
import Link from "next/link";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import { SiteNav } from "@/components/layout/site-nav";
import { ThemeProvider } from "@/components/theme/theme-provider";

const nunito = Nunito({
  variable: "--font-body",
  subsets: ["latin"],
});

const playfair = Playfair_Display({
  variable: "--font-display",
  subsets: ["latin"],
});

const caveat = Caveat({
  variable: "--font-script",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Meshy Links",
  description:
    "An original community-centered social platform concept focused on connections, stories, and shared creativity.",
};

const hasClerkKeys =
  Boolean(process.env.CLERK_SECRET_KEY) &&
  Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ||
      process.env.CLERK_PUBLISHABLE_KEY
  );

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const appShell = (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <div className="relative mx-auto min-h-screen max-w-7xl px-3 pb-10 sm:px-6 lg:px-8">
        <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <div className="hero-blob absolute -top-28 -left-12 h-72 w-72 rounded-full bg-[var(--blob-1)] blur-3xl" />
          <div className="hero-blob absolute top-36 right-0 h-72 w-72 rounded-full bg-[var(--blob-2)] blur-3xl" />
        </div>
        <SiteNav clerkEnabled={hasClerkKeys} />
        <main className="pt-8">{children}</main>
        <footer className="mt-12 border-t border-[var(--border-soft)] pt-5 pb-2">
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-black/70 dark:text-white/75">
            <Link href="/terms" className="transition hover:text-[var(--accent)] hover:underline">
              Terms of Service
            </Link>
            <Link href="/privacy" className="transition hover:text-[var(--accent)] hover:underline">
              Privacy Policy
            </Link>
            <Link href="/report" className="transition hover:text-[var(--accent)] hover:underline">
              Report / Remove Me
            </Link>
          </div>
        </footer>
      </div>
      <Analytics />
    </ThemeProvider>
  );

  return (
    <html
      lang="en"
      className={`${nunito.variable} ${playfair.variable} ${caveat.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full soft-grid">
        {hasClerkKeys ? <ClerkProvider>{appShell}</ClerkProvider> : appShell}
      </body>
    </html>
  );
}
