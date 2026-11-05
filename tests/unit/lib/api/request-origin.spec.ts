import { ForbiddenError } from '@/lib/api/errors';
import { assertSameOriginMutation } from '@/lib/api/request-origin';
import { describe, expect, it } from 'vitest';

function request(
  method: string,
  headers: Record<string, string> = {},
): Request {
  return new Request('https://atlaris.app/api/v1/plans', {
    method,
    headers: { host: 'atlaris.app', ...headers },
  });
}

describe('assertSameOriginMutation', () => {
  it.each(['GET', 'HEAD', 'OPTIONS'])(
    'lets %s through without any origin header',
    (method) => {
      expect(() =>
        assertSameOriginMutation(
          request(method, { 'sec-fetch-site': 'cross-site' }),
        ),
      ).not.toThrow();
    },
  );

  it.each(['same-origin', 'none'])(
    'lets a POST with sec-fetch-site %s through',
    (site) => {
      expect(() =>
        assertSameOriginMutation(request('POST', { 'sec-fetch-site': site })),
      ).not.toThrow();
    },
  );

  it.each(['cross-site', 'same-site'])(
    'rejects a POST with sec-fetch-site %s',
    (site) => {
      expect(() =>
        assertSameOriginMutation(request('POST', { 'sec-fetch-site': site })),
      ).toThrow(ForbiddenError);
    },
  );

  it('prefers sec-fetch-site over a matching origin', () => {
    expect(() =>
      assertSameOriginMutation(
        request('DELETE', {
          'sec-fetch-site': 'cross-site',
          origin: 'https://atlaris.app',
        }),
      ),
    ).toThrow(ForbiddenError);
  });

  it('lets a POST whose origin matches the host through', () => {
    expect(() =>
      assertSameOriginMutation(
        request('POST', { origin: 'https://atlaris.app' }),
      ),
    ).not.toThrow();
  });

  it.each(['https://evil.example', 'https://jobs.atlaris.app', 'null'])(
    'rejects a POST from origin %s',
    (origin) => {
      expect(() =>
        assertSameOriginMutation(request('PATCH', { origin })),
      ).toThrow(ForbiddenError);
    },
  );

  it('lets a POST with neither header through (not a browser)', () => {
    expect(() => assertSameOriginMutation(request('POST'))).not.toThrow();
  });

  it('compares the origin with x-forwarded-host before host', () => {
    const forwarded = {
      host: 'internal.vercel.app',
      'x-forwarded-host': 'atlaris.app',
    };
    expect(() =>
      assertSameOriginMutation(
        request('PUT', { ...forwarded, origin: 'https://atlaris.app' }),
      ),
    ).not.toThrow();
    expect(() =>
      assertSameOriginMutation(
        request('PUT', { ...forwarded, origin: 'https://internal.vercel.app' }),
      ),
    ).toThrow(ForbiddenError);
  });
});
