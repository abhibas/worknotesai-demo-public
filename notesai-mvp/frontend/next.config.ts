import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  turbopack: {
    root: __dirname,
  },
  eslint: {
    // Don't fail build on ESLint errors during production build
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Don't fail build on TypeScript errors during production build
    ignoreBuildErrors: false, // Keep false to catch real errors, but allow ESLint to pass
  },
};

export default nextConfig;
