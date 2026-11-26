import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Vercel deployment configuration
  // Show dev indicator (bottom-right so it's not covered by sidebar) in development
  devIndicators: {
    position: "bottom-right",
  },
  images: {
    unoptimized: true,
  },
  // Public pages that were merged into others. Temporary (307) until the new pages are
  // confirmed live; switch to `permanent: true` afterwards so search engines move the ranking.
  async redirects() {
    return [
      { source: '/forensic-review', destination: '/how-it-works', permanent: false },
      { source: '/philosophy', destination: '/how-it-works', permanent: false },
      { source: '/technical-docs', destination: '/how-it-works', permanent: false },
      { source: '/market-outlook', destination: '/market-data', permanent: false },
    ];
  },
  async rewrites() {
    return [
      {
        source: '/posts/:slug',
        destination: '/api/posts/:slug',
      },
    ];
  },
};

export default nextConfig;
