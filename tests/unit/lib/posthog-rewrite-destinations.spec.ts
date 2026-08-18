import {
  normalizePostHogSdkHost,
  resolvePostHogRewriteDestinations,
} from '@/lib/posthog-rewrite-destinations';
import { describe, expect, it } from 'vitest';

const US = {
  ingestOrigin: 'https://us.i.posthog.com',
  assetsOrigin: 'https://us-assets.i.posthog.com',
};

const EU = {
  ingestOrigin: 'https://eu.i.posthog.com',
  assetsOrigin: 'https://eu-assets.i.posthog.com',
};

describe('resolvePostHogRewriteDestinations', () => {
  it.each([undefined, null, '', '   ', 'https://us.i.posthog.com'])(
    'defaults to US Cloud for %j',
    (host) => {
      expect(resolvePostHogRewriteDestinations(host)).toEqual(US);
    },
  );

  it.each([
    'https://eu.i.posthog.com',
    'https://eu.i.posthog.com/',
    'https://eu.posthog.com',
    'eu.i.posthog.com',
    'https://eu-assets.i.posthog.com',
  ])('maps EU Cloud host %s to EU ingest and assets', (host) => {
    expect(resolvePostHogRewriteDestinations(host)).toEqual(EU);
  });

  it('does not treat a custom host as EU', () => {
    expect(
      resolvePostHogRewriteDestinations('https://posthog.example.com'),
    ).toEqual({
      ingestOrigin: 'https://posthog.example.com',
      assetsOrigin: 'https://posthog.example.com',
    });
  });

  it('preserves the base path for self-hosted PostHog', () => {
    expect(
      resolvePostHogRewriteDestinations(
        'https://posthog.example.com/analytics/',
      ),
    ).toEqual({
      ingestOrigin: 'https://posthog.example.com/analytics',
      assetsOrigin: 'https://posthog.example.com/analytics',
    });
  });

  it('rejects malformed configured hosts instead of silently routing to US Cloud', () => {
    expect(() => resolvePostHogRewriteDestinations('not a host')).toThrow(
      'NEXT_PUBLIC_POSTHOG_HOST must be a valid HTTP(S) host',
    );
  });
});

describe('normalizePostHogSdkHost', () => {
  it('keeps eu.posthog.com as the UI origin while ingest maps to eu.i.posthog.com', () => {
    expect(normalizePostHogSdkHost('eu.posthog.com')).toBe(
      'https://eu.posthog.com',
    );
    expect(
      resolvePostHogRewriteDestinations('eu.posthog.com').ingestOrigin,
    ).toBe('https://eu.i.posthog.com');
  });

  it('prepends https for schemeless Cloud hosts', () => {
    expect(normalizePostHogSdkHost('eu.i.posthog.com')).toBe(
      'https://eu.i.posthog.com',
    );
  });

  it('returns null for malformed hosts', () => {
    expect(normalizePostHogSdkHost('not a host')).toBeNull();
  });
});
