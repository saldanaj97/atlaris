import { withStepDb } from '../../../../workers/jobs/src/db';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const pg = vi.hoisted(() => ({
  instances: [] as Array<{ end: ReturnType<typeof vi.fn> }>,
  endResult: Promise.resolve() as Promise<void>,
}));

vi.mock('pg', () => ({
  Pool: class {
    end = vi.fn(() => pg.endResult);
    constructor() {
      pg.instances.push(this);
    }
  },
}));

const hyperdrive = {
  connectionString: 'postgres://u:p@127.0.0.1:5432/postgres',
};

describe('withStepDb', () => {
  beforeEach(() => {
    pg.instances.length = 0;
    pg.endResult = Promise.resolve();
  });

  it('closes the pool before resolving', async () => {
    const order: string[] = [];
    pg.endResult = Promise.resolve().then(() => {
      order.push('pool closed');
    });

    const result = await withStepDb(hyperdrive, async () => {
      order.push('work done');
      return 'ok';
    });
    order.push('resolved');

    expect(result).toBe('ok');
    expect(pg.instances).toHaveLength(1);
    expect(pg.instances[0]!.end).toHaveBeenCalledOnce();
    expect(order).toEqual(['work done', 'pool closed', 'resolved']);
  });

  it('closes the pool when the work throws', async () => {
    await expect(
      withStepDb(hyperdrive, async () => {
        throw new Error('query failed');
      }),
    ).rejects.toThrow('query failed');

    expect(pg.instances[0]!.end).toHaveBeenCalledOnce();
  });

  it('does not fail finished work when the pool close fails', async () => {
    pg.endResult = Promise.reject(new Error('socket closed'));

    await expect(withStepDb(hyperdrive, async () => 'ok')).resolves.toBe('ok');
  });
});
