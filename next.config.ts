import type { NextConfig } from "next";

const clerkSources = [
  "https://*.clerk.com",
  "https://*.clerk.accounts.dev",
  "https://clerk.meshylinks.com",
].join(" ");

const captchaSources = [
  "https://challenges.cloudflare.com",
].join(" ");

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "font-src 'self' https: data:",
  "img-src 'self' data: blob: https:",
  "object-src 'none'",
  `script-src 'self' 'unsafe-inline' ${clerkSources} ${captchaSources}`,
  `script-src-elem 'self' 'unsafe-inline' ${clerkSources} ${captchaSources}`,
  `worker-src 'self' blob: ${clerkSources}`,
  "style-src 'self' 'unsafe-inline' https:",
  `connect-src 'self' https: wss: ${captchaSources}`,
  `frame-src 'self' ${clerkSources} ${captchaSources}`,
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: contentSecurityPolicy,
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
