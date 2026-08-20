import {
  AGENT_DATABASE_URL,
  AGENT_ENV_FILE_CONTENT,
  COMMANDS,
  RLS_ROLE_NORMALIZATION_SQL,
  assertManagedAgentDatabaseUrl,
  assertNoTargetArguments,
  assertSafeDatabaseEnvironment,
  inspectAgentEnvFile,
  listCommittedMigrationVersions,
  mergeManagedDatabaseUrls,
  migrationOrderIsSafe,
  unexpectedMigrationVersions,
} from '../../../scripts/agents/cloud-postgres';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('Cursor Cloud PostgreSQL safety boundary', () => {
  it.each([
    AGENT_DATABASE_URL,
    'postgresql://atlaris_agent@localhost:55432/atlaris_agent?sslmode=disable',
  ])('accepts and normalizes the managed target: %s', (url) => {
    expect(assertManagedAgentDatabaseUrl(url)).toBe(AGENT_DATABASE_URL);
  });

  it.each([
    'postgresql://postgres:secret@db.example.supabase.co:5432/postgres',
    'postgresql://postgres@database.example.com:5432/atlaris_agent',
    'postgresql://postgres@192.0.2.10:55432/atlaris_agent',
    'postgresql://atlaris_agent@127.0.0.1:55432/atlaris-dev',
    'postgresql://atlaris_agent@127.0.0.1:55432/atlaris-prod',
    'postgresql://atlaris_agent@127.0.0.1:55432/unexpected',
    'not-a-url',
  ])('rejects an unmanaged target before connection: %s', (url) => {
    expect(() => assertManagedAgentDatabaseUrl(url)).toThrow(/Refusing/);
  });

  it('rejects hosted database environment variables', () => {
    expect(() =>
      assertSafeDatabaseEnvironment({
        POSTGRES_URL:
          'postgresql://postgres:secret@db.example.supabase.co:5432/postgres',
      }),
    ).toThrow(/Refusing/);
    expect(() =>
      assertSafeDatabaseEnvironment({ SUPABASE_ACCESS_TOKEN: 'present' }),
    ).toThrow(/Refusing/);
  });

  it('accepts only the managed local database variables', () => {
    expect(() =>
      assertSafeDatabaseEnvironment({
        POSTGRES_URL: AGENT_DATABASE_URL,
        POSTGRES_URL_NON_POOLING: AGENT_DATABASE_URL,
      }),
    ).not.toThrow();
  });

  it('creates or merges the managed URLs without discarding agent env values', () => {
    expect(inspectAgentEnvFile(null)).toBe('create');
    expect(inspectAgentEnvFile(AGENT_ENV_FILE_CONTENT)).toBe('keep');
    expect(inspectAgentEnvFile('NEXT_PUBLIC_APP_URL=http://localhost')).toBe(
      'merge',
    );
    expect(
      mergeManagedDatabaseUrls(
        'NEXT_PUBLIC_APP_URL=http://localhost\nPOSTGRES_URL=\nPOSTGRES_URL_NON_POOLING=\n',
      ),
    ).toBe(
      `NEXT_PUBLIC_APP_URL=http://localhost\nPOSTGRES_URL=${AGENT_DATABASE_URL}\nPOSTGRES_URL_NON_POOLING=${AGENT_DATABASE_URL}\n`,
    );
  });

  it('models status and preflight as read-only commands', () => {
    expect(COMMANDS.status.readOnly).toBe(true);
    expect(COMMANDS.preflight.readOnly).toBe(true);
    expect(COMMANDS.up.readOnly).toBe(false);
    expect(COMMANDS.reset.readOnly).toBe(false);
  });

  it('does not allow reset or other commands to accept a target URL', () => {
    expect(() => assertNoTargetArguments([])).not.toThrow();
    expect(() =>
      assertNoTargetArguments([
        'postgresql://postgres@db.example.supabase.co/postgres',
      ]),
    ).toThrow(/do not accept URL or target arguments/);
  });

  it('requires every committed SQL migration and safe archive ordering', async () => {
    const versions = await listCommittedMigrationVersions();

    expect(versions.length).toBeGreaterThan(0);
    expect(versions).toContain('20260520194501');
    expect(versions).toContain('20260706221000');
    expect(versions).toContain('20260706222017');
    expect(migrationOrderIsSafe(versions)).toBe(true);
  });

  it('rejects migration order checks with missing or reversed migrations', () => {
    expect(migrationOrderIsSafe(['20260706222017'])).toBe(false);
    expect(migrationOrderIsSafe(['20260706221000'])).toBe(false);
    expect(migrationOrderIsSafe(['20260706222017', '20260706221000'])).toBe(
      false,
    );
  });

  it('reports applied migrations that are absent from the checkout', () => {
    expect(unexpectedMigrationVersions(['001', '002'], ['001', '003'])).toEqual(
      ['003'],
    );
  });

  it('normalizes every RLS role away from superuser privileges', () => {
    expect(RLS_ROLE_NORMALIZATION_SQL.match(/NOSUPERUSER/g)).toHaveLength(3);
    expect(RLS_ROLE_NORMALIZATION_SQL).toContain('ALTER ROLE anon');
    expect(RLS_ROLE_NORMALIZATION_SQL).toContain('ALTER ROLE authenticated');
    expect(RLS_ROLE_NORMALIZATION_SQL).toContain('ALTER ROLE service_role');
  });

  it('selects Node 24 for Cursor install and startup commands', async () => {
    const config = JSON.parse(
      await readFile('.cursor/environment.json', 'utf8'),
    ) as { install: string; start: string };

    expect(config.install).toContain('nvm install 24');
    expect(config.start).toContain('nvm use 24');
    expect(config.start).toContain('codex-1password-env.sh');
  });
});
