import { normalizeProxyPathname } from '@/lib/proxy/normalize-pathname';
import { describe, expect, it } from 'vitest';

describe('normalizeProxyPathname', () => {
  it.each([
    ['/dashboard', '/dashboard'],
    ['/%64ashboard', '/dashboard'],
    ['/%61pi/v1/plans', '/api/v1/plans'],
    ['/plans/%E2%9C%93', '/plans/✓'],
    // Decodes once only, like Next's route params.
    ['/%2564ashboard', '/%64ashboard'],
    ['/plans/a%2Fb', '/plans/a/b'],
    ['/plans/..x', '/plans/..x'],
  ])('maps %s to %s', (input, expected) => {
    expect(normalizeProxyPathname(input)).toBe(expected);
  });

  it.each(['/%ZZ', '/dashboard%', '/%E2%9C'])(
    'rejects invalid percent-encoding in %s',
    (input) => {
      expect(normalizeProxyPathname(input)).toBeNull();
    },
  );

  it.each([
    '/api/internal%2F..%2F..%2Fdashboard',
    '/plans/%2e',
    '/plans/x%2F%2e%2e',
    '/api/internal/%2e%2e/v1/plans',
  ])('rejects a dot segment revealed by decoding in %s', (input) => {
    expect(normalizeProxyPathname(input)).toBeNull();
  });
});
