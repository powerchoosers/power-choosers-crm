import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    unoptimized: true,
  },
  async rewrites() {
    const isProd = process.env.NODE_ENV === 'production';
    const backendUrl = isProd 
      ? 'https://nodal-point-network-792458658491.us-central1.run.app'
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
