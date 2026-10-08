import { executeRows, toExecuteRows } from '@/lib/db/execute-rows';
import { sql } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';

describe('toExecuteRows', () => {
  it('returns a postgres.js row array as is', () => {
    const rows = [{ id: 'a' }, { id: 'b' }];
    expect(toExecuteRows(rows)).toBe(rows);
  });

  it('returns the rows of a node-postgres result', () => {
    const rows = [{ id: 'a' }];
    expect(toExecuteRows({ rows, rowCount: 1, command: 'SELECT' })).toBe(rows);
  });

  it.each([undefined, null, 'rows', { rowCount: 0 }, { rows: 'nope' }])(
    'rejects %j',
    (result) => {
      expect(() => toExecuteRows(result)).toThrow(
        'Unrecognized execute() result',
      );
    },
  );
});

describe('executeRows', () => {
  it('runs the query and normalizes a node-postgres result', async () => {
    const query = sql`select 1 as ok`;
    const execute = vi.fn().mockResolvedValue({ rows: [{ ok: 1 }] });

    await expect(
      executeRows<{ ok: number }>({ execute }, query),
    ).resolves.toEqual([{ ok: 1 }]);
    expect(execute).toHaveBeenCalledWith(query);
  });
});
