import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  env: {
    NEXT_PUBLIC_BFF_URL: process.env.NEXT_PUBLIC_BFF_URL || 'http://bff-service:3006',
  },
};

export default nextConfig;
