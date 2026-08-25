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
  it('maps Cloud ingest and UI hosts to the app origin', () => {
    expect(normalizePostHogSdkHost('eu.posthog.com')).toBe(
      'https://eu.posthog.com',
    );
    expect(normalizePostHogSdkHost('https://eu.i.posthog.com')).toBe(
      'https://eu.posthog.com',
    );
    expect(normalizePostHogSdkHost('us.i.posthog.com')).toBe(
      'https://us.posthog.com',
    );
    expect(
      resolvePostHogRewriteDestinations('eu.posthog.com').ingestOrigin,
    ).toBe('https://eu.i.posthog.com');
  });

  it('keeps self-hosted origins for toolbar links', () => {
    expect(
      normalizePostHogSdkHost('https://posthog.example.com/analytics/'),
    ).toBe('https://posthog.example.com/analytics');
  });

  it('returns null for malformed hosts', () => {
    expect(normalizePostHogSdkHost('not a host')).toBeNull();
  });
});
