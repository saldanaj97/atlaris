import {
  isNativeTestDbEnabled,
  parseNativeTestStackDbUrl,
  startNativeTestStack,
} from '@tests/setup/native-test-stack';
import { describe, expect, it } from 'vitest';

function statusJson(dbUrl: string): string {
  return JSON.stringify({
    identity: { name: 'test' },
    runtime: 'native',
    env: { DB_URL: dbUrl },
  });
}

describe('native test stack switch', () => {
  it.each([undefined, '', '  '])(
    'keeps the default database path when ATLARIS_TEST_DB is %j',
    (value) => {
      expect(isNativeTestDbEnabled({ ATLARIS_TEST_DB: value })).toBe(false);
    },
  );

  it('enables the native stack for ATLARIS_TEST_DB=native', () => {
    expect(isNativeTestDbEnabled({ ATLARIS_TEST_DB: 'native' })).toBe(true);
  });

  it('rejects any other ATLARIS_TEST_DB value', () => {
    expect(() =>
      isNativeTestDbEnabled({ ATLARIS_TEST_DB: 'testcontainers' }),
    ).toThrow(/ATLARIS_TEST_DB must be unset or "native"/);
  });
});

describe('native test stack status', () => {
  it('reads env.DB_URL from supabase status JSON', () => {
    expect(
      parseNativeTestStackDbUrl(
        statusJson('postgresql://postgres:postgres@127.0.0.1:24216/postgres'),
      ),
    ).toBe('postgresql://postgres:postgres@127.0.0.1:24216/postgres');
  });

  it('fails when the status has no DB_URL', () => {
    expect(() =>
      parseNativeTestStackDbUrl(JSON.stringify({ env: {} })),
    ).toThrow(/DB_URL/);
  });

  it('refuses a non-local database host', () => {
    expect(() =>
      parseNativeTestStackDbUrl(
        statusJson(
          'postgresql://postgres:postgres@db.example.com:5432/postgres',
        ),
      ),
    ).toThrow(/non-local PostgreSQL host "db.example.com"/);
  });

  it('starts or resumes the named native stack before reading its status', () => {
    const calls: string[][] = [];
    const dbUrl = startNativeTestStack((args) => {
      calls.push([...args]);
      return args[0] === 'status'
        ? statusJson('postgresql://postgres:postgres@127.0.0.1:24216/postgres')
        : '{}';
    });

    expect(calls).toEqual([
      [
        'start',
        '--stack',
        'test',
        '--runtime',
        'native',
        '--output-format',
        'json',
      ],
      ['status', '--stack', 'test', '--output-format', 'json'],
    ]);
    expect(dbUrl).toBe(
      'postgresql://postgres:postgres@127.0.0.1:24216/postgres',
    );
  });
});
