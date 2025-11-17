import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'product-images.tcgplayer.com' },
      { protocol: 'https', hostname: 'tcgplayer-cdn.tcgplayer.com' },
      { protocol: 'https', hostname: 'www.tcgplayer.com' },
      { protocol: 'https', hostname: 'tcgplayer.com' },
      { protocol: 'https', hostname: 'storage.googleapis.com' },
    ],
  },
  serverExternalPackages: ['@sparticuz/chromium-min'],
  // Production optimizations
  compress: true,
  poweredByHeader: false,
  generateEtags: false,
  // Redirects
  async redirects() {
    return [
      {
        source: '/work/',
        destination: '/work',
        permanent: true,
      },
    ];
  },
  // Security headers
  async headers() {
    const isDev = process.env.NODE_ENV === 'development';

    // Next.js requires 'unsafe-inline' for inline scripts in production
    // In development, also needs 'unsafe-eval' for HMR and webpack
    const scriptSrc = isDev
      ? "'self' 'unsafe-eval' 'unsafe-inline'"
      : "'self' 'unsafe-inline'";

    const connectSrc = isDev
      ? "'self' ws: wss:"  // Allow WebSocket connections for HMR
      : "'self' https:";

    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'origin-when-cross-origin',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },
          {
            key: 'Content-Security-Policy',
            value: `default-src 'self'; script-src ${scriptSrc}; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src ${connectSrc}; font-src 'self'; object-src 'none'; media-src 'self'; frame-src 'none';`,
          },
        ],
      },
    ];
  },
};

export default nextConfig;
