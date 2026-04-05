import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getEnvironment,
  getReplayErrorSampleRate,
  getReplaySessionSampleRate,
  shouldEnableLogs,
  tracesSampler,
} from '@/lib/observability/sampling';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function withEnv(nodeEnv: string, fn: () => void) {
  vi.stubEnv('NODE_ENV', nodeEnv);
  try {
    fn();
  } finally {
    vi.unstubAllEnvs();
  }
}

// ---------------------------------------------------------------------------
// getEnvironment
// ---------------------------------------------------------------------------

describe('getEnvironment', () => {
  it('returns "production" when NODE_ENV is production', () => {
    withEnv('production', () => {
      expect(getEnvironment()).toBe('production');
    });
  });

  it('returns "test" when NODE_ENV is test', () => {
    withEnv('test', () => {
      expect(getEnvironment()).toBe('test');
    });
  });

  it('returns "development" when NODE_ENV is development', () => {
    withEnv('development', () => {
      expect(getEnvironment()).toBe('development');
    });
  });

  it('defaults to "development" for unknown NODE_ENV values', () => {
    withEnv('staging', () => {
      expect(getEnvironment()).toBe('development');
    });
  });
});

// ---------------------------------------------------------------------------
// Replay sample rates
// ---------------------------------------------------------------------------

describe('getReplaySessionSampleRate', () => {
  it('returns 0.1 in production (10 % of sessions)', () => {
    withEnv('production', () => {
      expect(getReplaySessionSampleRate()).toBe(0.1);
    });
  });

  it('returns 1.0 in development (full visibility)', () => {
    withEnv('development', () => {
      expect(getReplaySessionSampleRate()).toBe(1.0);
    });
  });

  it('returns 0 in test (no replays)', () => {
    withEnv('test', () => {
      expect(getReplaySessionSampleRate()).toBe(0);
    });
  });
});

describe('getReplayErrorSampleRate', () => {
  it.each(['production', 'development', 'test'])('returns 1.0 in %s', (env) => {
    withEnv(env, () => {
      expect(getReplayErrorSampleRate()).toBe(1.0);
    });
  });
});

// ---------------------------------------------------------------------------
// tracesSampler
// ---------------------------------------------------------------------------

describe('tracesSampler', () => {
  describe('parent sampling inheritance', () => {
    it('returns 1.0 when parent was sampled', () => {
      withEnv('production', () => {
        expect(tracesSampler({ name: '/api/plans', parentSampled: true })).toBe(
          1.0
        );
      });
    });

    it('returns 0 when parent was NOT sampled', () => {
      withEnv('production', () => {
        expect(
          tracesSampler({ name: '/api/plans', parentSampled: false })
        ).toBe(0);
      });
    });
  });

  describe('low-value traces (production)', () => {
    beforeEach(() => {
      vi.stubEnv('NODE_ENV', 'production');
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it.each([
      ['Next.js static assets', 'GET /_next/static/chunk.js'],
      ['favicon', 'GET /favicon.ico'],
      ['health check', 'GET /api/health'],
      ['robots.txt', 'GET /robots.txt'],
      ['sitemap', 'GET /sitemap.xml'],
      ['CSS files', 'GET /styles/main.css'],
      ['image files', 'GET /images/logo.png'],
      ['font files', 'GET /fonts/inter.woff2'],
    ])('drops %s (rate = 0)', (_label, name) => {
      expect(tracesSampler({ name })).toBe(0);
    });
  });

  describe('low-value traces (development)', () => {
    beforeEach(() => {
      vi.stubEnv('NODE_ENV', 'development');
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('samples low-value traces at minimal rate in dev', () => {
      expect(tracesSampler({ name: 'GET /_next/static/chunk.js' })).toBe(0.01);
    });
  });

  describe('high-value traces — API routes (production)', () => {
    beforeEach(() => {
      vi.stubEnv('NODE_ENV', 'production');
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it.each([
      'GET /api/plans',
      'POST /api/v1/plans/stream',
      'GET /api/settings/profile',
    ])('samples "%s" at 0.2', (name) => {
      expect(tracesSampler({ name })).toBe(0.2);
    });
  });

  describe('high-value traces — API routes (development)', () => {
    beforeEach(() => {
      vi.stubEnv('NODE_ENV', 'development');
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('samples API routes at 1.0 in dev', () => {
      expect(tracesSampler({ name: 'GET /api/plans' })).toBe(1.0);
    });
  });

  describe('default traces', () => {
    it('returns 0.05 in production', () => {
      withEnv('production', () => {
        expect(tracesSampler({ name: '/dashboard' })).toBe(0.05);
      });
    });

    it('returns 0.5 in development', () => {
      withEnv('development', () => {
        expect(tracesSampler({ name: '/dashboard' })).toBe(0.5);
      });
    });

    it('returns 0 in test', () => {
      withEnv('test', () => {
        expect(tracesSampler({ name: '/dashboard' })).toBe(0);
      });
    });
  });

  describe('edge cases', () => {
    it('handles missing name gracefully', () => {
      withEnv('production', () => {
        expect(tracesSampler({})).toBe(0.05);
      });
    });

    it('handles empty name', () => {
      withEnv('production', () => {
        expect(tracesSampler({ name: '' })).toBe(0.05);
      });
    });

    it('health check is classified as low-value even without HTTP method prefix', () => {
      withEnv('production', () => {
        expect(tracesSampler({ name: '/api/health' })).toBe(0);
      });
    });
  });
});

// ---------------------------------------------------------------------------
// shouldEnableLogs
// ---------------------------------------------------------------------------

describe('shouldEnableLogs', () => {
  it('returns false in production (reduces ingest volume)', () => {
    withEnv('production', () => {
      expect(shouldEnableLogs()).toBe(false);
    });
  });

  it('returns true in development', () => {
    withEnv('development', () => {
      expect(shouldEnableLogs()).toBe(true);
    });
  });

  it('returns true in test', () => {
    withEnv('test', () => {
      expect(shouldEnableLogs()).toBe(true);
    });
  });

  it('SENTRY_ENABLE_LOGS=true overrides production default', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SENTRY_ENABLE_LOGS', 'true');
    try {
      expect(shouldEnableLogs()).toBe(true);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('SENTRY_ENABLE_LOGS=1 overrides production default', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SENTRY_ENABLE_LOGS', '1');
    try {
      expect(shouldEnableLogs()).toBe(true);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('SENTRY_ENABLE_LOGS=false overrides development default', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('SENTRY_ENABLE_LOGS', 'false');
    try {
      expect(shouldEnableLogs()).toBe(false);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('SENTRY_ENABLE_LOGS=0 overrides development default', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('SENTRY_ENABLE_LOGS', '0');
    try {
      expect(shouldEnableLogs()).toBe(false);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('ignores unrecognised SENTRY_ENABLE_LOGS values and falls back to env', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SENTRY_ENABLE_LOGS', 'yes');
    try {
      expect(shouldEnableLogs()).toBe(false);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

// ---------------------------------------------------------------------------
// Contract: high-severity failures are always captured
// ---------------------------------------------------------------------------

describe('high-severity capture guarantees', () => {
  it.each([
    'production',
    'development',
    'test',
  ])('error replays are 100%% in %s', (env) => {
    withEnv(env, () => {
      expect(getReplayErrorSampleRate()).toBe(1.0);
    });
  });

  it.each([
    'production',
    'development',
    'test',
  ])('traces with sampled parents are never dropped in %s', (env) => {
    withEnv(env, () => {
      expect(tracesSampler({ name: 'anything', parentSampled: true })).toBe(
        1.0
      );
    });
  });

  it.each([
    'production',
    'development',
  ])('API routes have non-zero sample rate in %s', (env) => {
    withEnv(env, () => {
      const rate = tracesSampler({ name: 'POST /api/plans' });
      expect(rate).toBeGreaterThan(0);
    });
  });
});
