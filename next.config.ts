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
            value: "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self'; font-src 'self'; object-src 'none'; media-src 'self'; frame-src 'none';",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
