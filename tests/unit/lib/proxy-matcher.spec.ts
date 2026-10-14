import { config as proxyConfig } from '@/proxy';
import { getPathMatch } from 'next/dist/shared/lib/router/utils/path-match';
import { describe, expect, it } from 'vitest';

function matchesProxyMatcher(pathname: string): boolean {
  return proxyConfig.matcher.some((pattern) => {
    const match = getPathMatch(pattern);
    return match(pathname);
  });
}

describe('proxy matcher', () => {
  it('still excludes static assets and next internals', () => {
    expect(matchesProxyMatcher('/_next/static/chunk.js')).toBe(false);
    expect(matchesProxyMatcher('/favicon.ico')).toBe(false);
  });

  it('excludes text and XML files outside the API', () => {
    expect(matchesProxyMatcher('/robots.txt')).toBe(false);
    expect(matchesProxyMatcher('/sitemap.xml')).toBe(false);
    expect(matchesProxyMatcher('/api/foo.xml')).toBe(true);
    expect(matchesProxyMatcher('/plans')).toBe(true);
  });

  it('only excludes the PostHog ingest path and its descendants', () => {
    expect(matchesProxyMatcher('/ingest')).toBe(false);
    expect(matchesProxyMatcher('/ingest/array')).toBe(false);
    expect(matchesProxyMatcher('/ingestion')).toBe(true);
    expect(matchesProxyMatcher('/ingest-api')).toBe(true);
  });
});
