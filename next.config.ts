import type { NextConfig } from 'next';
import path from 'path';

const LOCALE = process.env.NEXT_PUBLIC_LOCALE || 'en-us';
const LOCALE_ALIAS = './date-fns-locale-alias';
const LOCALE_DYNAMIC = `i18n/locales/${LOCALE}`;

const nextConfig: NextConfig = {
  // Images are pre-optimized at upload time (`-sm`/`-md`/`-lg`
  // derivatives are generated in the browser), so no server-side
  // image optimizer is required — a hard requirement on platforms
  // like Cloudflare Workers and EdgeOne Pages where `sharp` is
  // unavailable.
  images: {
    unoptimized: true,
  },
  experimental: {
    serverActions: {
      // Metadata backup bundles are restored in a single request
      bodySizeLimit: '50mb',
    },
  },
  serverExternalPackages: ['exifr'],
  turbopack: {
    resolveAlias: {
      [LOCALE_ALIAS]: `@/${LOCALE_DYNAMIC}`,
    },
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      [LOCALE_ALIAS]: path.resolve(__dirname, `src/${LOCALE_DYNAMIC}`),
    };
    return config;
  },
};

module.exports = nextConfig;
