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
    const isProd = process.env.NODE_ENV === 'production';
    const backendUrl = isProd 
      ? 'https://power-choosers-crm-792458658491.us-south1.run.app'
      : 'http://127.0.0.1:3001';

    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
      {
        source: '/crm-dashboard.html',
        destination: `${backendUrl}/crm-dashboard.html`,
      },
    ];
  },
};

export default nextConfig;
