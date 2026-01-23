import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    unoptimized: true,
  },
  // turbopack: {
  //   root: "C:/Users/Lap3p/OneDrive/Documents/Power Choosers CRM/crm-platform",
  // },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:3001/api/:path*',
      },
      // Proxy legacy dashboard for verification if needed
      {
        source: '/crm-dashboard.html',
        destination: 'http://localhost:3001/crm-dashboard.html',
      },
    ];
  },
};

export default nextConfig;
