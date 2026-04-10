import type { Metadata } from "next";
import { Caveat, Nunito, Playfair_Display } from "next/font/google";
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
  title: "Signal Bloom",
  description:
    "An original community-centered social platform concept focused on connections, stories, and shared creativity.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${nunito.variable} ${playfair.variable} ${caveat.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full soft-grid">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <div className="relative mx-auto min-h-screen max-w-7xl px-3 pb-10 sm:px-6 lg:px-8">
            <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
              <div className="hero-blob absolute -top-28 -left-12 h-72 w-72 rounded-full bg-[var(--blob-1)] blur-3xl" />
              <div className="hero-blob absolute top-36 right-0 h-72 w-72 rounded-full bg-[var(--blob-2)] blur-3xl" />
            </div>
            <SiteNav />
            <main className="pt-8">{children}</main>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
