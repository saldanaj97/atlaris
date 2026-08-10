import { getPostgresHostname } from '../../../scripts/db/local-postgres-host';
import { describe, expect, it } from 'vitest';

describe('getPostgresHostname', () => {
  it('normalizes bracketed IPv6 hostnames', () => {
    expect(getPostgresHostname('postgresql://user:pass@[::1]:5432/db')).toBe(
      '::1',
    );
  });

  it.each([
    ['postgresql://user:pass@localhost:5432/db', 'localhost'],
    ['postgresql://user:pass@127.0.0.1:5432/db', '127.0.0.1'],
    ['postgresql://user:pass@db.example.com:5432/db', 'db.example.com'],
    ['not a postgres url', null],
  ])('returns %s host as %s', (url, hostname) => {
    expect(getPostgresHostname(url)).toBe(hostname);
  });
});
