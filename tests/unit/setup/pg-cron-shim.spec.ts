import { withUnschedulablePgCronHidden } from '@tests/helpers/db/bootstrap';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  unschedulable: true,
  statements: [] as string[],
}));

vi.mock('postgres', () => ({
  default: () =>
    Object.assign(async () => [{ unschedulable: state.unschedulable }], {
      unsafe: async (statements: string) => {
        state.statements.push(statements);
      },
      end: async () => {},
    }),
}));

const URL = 'postgresql://postgres:postgres@127.0.0.1:24216/atlaris_test_w1';

function normalized(statements: string): string[] {
  return statements
    .split(';')
    .map((statement) => statement.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

beforeEach(() => {
  state.unschedulable = true;
  state.statements = [];
});

describe('withUnschedulablePgCronHidden', () => {
  it('runs migrations without a shim when pg_cron is schedulable here', async () => {
    state.unschedulable = false;
    const applyMigrations = vi.fn();

    await withUnschedulablePgCronHidden(URL, applyMigrations);

    expect(applyMigrations).toHaveBeenCalledOnce();
    expect(state.statements).toEqual([]);
  });

  it('clears a stale shim before installing it', async () => {
    await withUnschedulablePgCronHidden(URL, () => {});

    const setup = normalized(state.statements[0] ?? '');
    const reset = setup.findIndex((s) => s.includes('RESET search_path'));
    const drop = setup.indexOf(
      'DROP SCHEMA IF EXISTS atlaris_test_pg_cron_shadow CASCADE',
    );
    const create = setup.indexOf('CREATE SCHEMA atlaris_test_pg_cron_shadow');

    expect(reset).toBeGreaterThanOrEqual(0);
    expect(drop).toBeGreaterThan(reset);
    expect(create).toBeGreaterThan(drop);
  });

  it('removes the shim when migrations fail', async () => {
    await expect(
      withUnschedulablePgCronHidden(URL, () => {
        throw new Error('migration failed');
      }),
    ).rejects.toThrow('migration failed');

    expect(state.statements).toHaveLength(2);
    expect(state.statements[1]).toContain('RESET search_path');
    expect(state.statements[1]).toContain(
      'DROP SCHEMA atlaris_test_pg_cron_shadow',
    );
  });
});
