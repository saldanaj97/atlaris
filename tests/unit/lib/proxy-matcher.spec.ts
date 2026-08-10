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
  it('includes workflow callback routes', () => {
    expect(matchesProxyMatcher('/.well-known/workflow/v1/flow')).toBe(true);
    expect(matchesProxyMatcher('/.well-known/workflow/v1/step')).toBe(true);
    expect(matchesProxyMatcher('/.well-known/workflow/v1/webhook/token')).toBe(
      true,
    );
  });

  it('still excludes static assets and next internals', () => {
    expect(matchesProxyMatcher('/_next/static/chunk.js')).toBe(false);
    expect(matchesProxyMatcher('/favicon.ico')).toBe(false);
  });
});
