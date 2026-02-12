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
  async rewrites() {
    return [
      {
        source: '/posts/:slug',
        destination: '/api/posts/:slug',
      },
    ];
  },
  async redirects() {
    return [
      {
        source: '/:path*',
        has: [
          {
            type: 'host',
            value: 'www.nodalpoint.io',
          },
        ],
        destination: 'https://nodalpoint.io/:path*',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
