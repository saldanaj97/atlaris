import type { NextConfig } from 'next';

import { resolvePostHogRewriteDestinations } from './src/lib/posthog-rewrite-destinations';
import { withSentryConfig } from '@sentry/nextjs';
import path from 'node:path';
import { withWorkflow } from 'workflow/next';

const vercelFlagsDefinitionsShim = path.join(
  process.cwd(),
  'src/lib/flags/vercel-flags-definitions-shim.ts',
);

const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=()',
  },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
];

const smokeDistDir = process.env.SMOKE_NEXT_DIST_DIR?.trim();
const isSmokeRun = Boolean(smokeDistDir && smokeDistDir.length > 0);
const allowedDevOrigins = ['127.0.0.1', 'localhost'];

const nextConfig: NextConfig = {
  allowedDevOrigins,
  distDir: smokeDistDir && smokeDistDir.length > 0 ? smokeDistDir : undefined,
  reactCompiler: true,
  experimental: {
    optimizePackageImports: ['lucide-react', 'date-fns'],
    // Turbopack's dev filesystem cache (.next/dev/cache/turbopack) grows
    // unbounded and is loaded into resident memory. The smoke lane runs two
    // disposable dev servers, so disable the cache there to cap memory. Normal
    // `pnpm dev` keeps the cache for fast rebuilds.
    ...(isSmokeRun ? { turbopackFileSystemCacheForDev: false } : {}),
  },
  serverExternalPackages: [
    'postgres',
    'pino',
    'pino-std-serializers',
    'pino-abstract-transport',
    'thread-stream',
    'sonic-boom',
  ],
  // flags-core optional-imports a Vercel-build-only package. Turbopack still
  // overlays "Can't resolve '@vercel/flags-definitions'" (vercel/flags#384).
  turbopack: {
    resolveAlias: {
      '@vercel/flags-definitions':
        './src/lib/flags/vercel-flags-definitions-shim.ts',
    },
  },
  webpack: (config) => {
    config.resolve ??= {};
    const existing = config.resolve.alias;
    if (Array.isArray(existing)) {
      existing.push({
        name: '@vercel/flags-definitions',
        alias: vercelFlagsDefinitionsShim,
      });
    } else {
      config.resolve.alias = {
        ...existing,
        '@vercel/flags-definitions': vercelFlagsDefinitionsShim,
      };
    }
    return config;
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },
  async rewrites() {
    const { ingestOrigin, assetsOrigin } = resolvePostHogRewriteDestinations(
      process.env.NEXT_PUBLIC_POSTHOG_HOST,
    );

    return [
      // PostHog reverse proxy — routes ingestion through the app to avoid ad-blockers.
      {
        source: '/ingest/static/:path*',
        destination: `${assetsOrigin}/static/:path*`,
      },
      {
        source: '/ingest/array/:path*',
        destination: `${assetsOrigin}/array/:path*`,
      },
      {
        source: '/ingest/:path*',
        destination: `${ingestOrigin}/:path*`,
      },
    ];
  },
  // Required to support PostHog trailing-slash API requests (global; Next cannot scope this to /ingest).
  // Proxy exact-path policies in middleware-policy.ts slash-normalize pathnames.
  skipTrailingSlashRedirect: true,
};

// workflow 4.8 removed workflows.lazyDiscovery (eager-only; vercel/workflow#2545).
const workflowNextConfig = withWorkflow(nextConfig);

export default withSentryConfig(workflowNextConfig, {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: 'jcs-software',

  project: 'atlaris',

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for more readable stack traces (increases build time)
  widenClientFileUpload: true,

  // Tunnel route disabled — unnecessary pre-launch and keeps server/DB warm for no reason.
  // Re-enable with `tunnelRoute: '/sentry-tunnel'` once you have real users and ad-blocker bypass matters.
  // tunnelRoute: '/sentry-tunnel',

  webpack: {
    // Automatically tree-shake Sentry logger statements to reduce bundle size
    treeshake: {
      removeDebugLogging: true,
    },

    // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
    // See the following for more information:
    // https://docs.sentry.io/product/crons/
    // https://vercel.com/docs/cron-jobs
    automaticVercelMonitors: true,
  },
});
