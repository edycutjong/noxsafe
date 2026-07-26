import { createRequire } from 'node:module';

// Single source of truth for the app version: the repo-root package.json that
// semantic-release bumps (and the README release badge tracks). Surfaced to the
// client as NEXT_PUBLIC_APP_VERSION and rendered in the footer.
const require = createRequire(import.meta.url);
const { version } = require('../package.json');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: { NEXT_PUBLIC_APP_VERSION: version },
  // Serve the self-contained pitch deck (public/pitch.html) at the clean /pitch URL.
  async rewrites() {
    return [{ source: '/pitch', destination: '/pitch.html' }];
  },
  // The Safe App SDK + our workspace rail-sdk ship TS/ESM source — transpile them.
  transpilePackages: ['@noxsafe/rail-sdk'],
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
  // The rail-sdk uses Node-ESM `.js` import specifiers that resolve to `.ts` sources.
  webpack: (config) => {
    config.resolve.extensionAlias = { '.js': ['.ts', '.tsx', '.js'] };
    return config;
  },
};
export default nextConfig;
