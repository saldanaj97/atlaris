import { dispatchRegenerationToWorker } from '@/features/jobs/regeneration-dispatch';
import { describe, expect, it, vi } from 'vitest';

const input = { jobId: 'job-1', planId: 'plan-1', userId: 'user-1' };
const config = () => ({
  url: 'https://workers-staging.atlaris.app',
  signingSecret: 'secret',
});

function makeLog() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

describe('dispatchRegenerationToWorker', () => {
  it('sends the v1 enqueue command for the job', async () => {
    const send = vi.fn(async () => ({
      kind: 'accepted' as const,
      status: 202,
      body: null,
    }));
    const log = makeLog();

    await dispatchRegenerationToWorker(input, { send, config, log });

    expect(send).toHaveBeenCalledWith(
      '/v1/regeneration/enqueue',
      { v: 1, jobId: 'job-1' },
      { config: config() },
    );
    expect(log.info).toHaveBeenCalledTimes(1);
    expect(log.warn).not.toHaveBeenCalled();
  });

  it.each([
    [{ kind: 'rejected' as const, status: 503, code: 'jobs_paused' }],
    [{ kind: 'unavailable' as const, reason: 'timeout' as const }],
  ])(
    'leaves the job pending and warns when the Worker does not accept',
    async (result) => {
      const log = makeLog();

      await expect(
        dispatchRegenerationToWorker(input, {
          send: vi.fn(async () => result),
          config,
          log,
        }),
      ).resolves.toBeUndefined();

      expect(log.warn).toHaveBeenCalledWith(
        expect.objectContaining({ jobId: 'job-1', outcome: result.kind }),
        expect.stringContaining('pending for the sweep'),
      );
    },
  );

  it('never throws, even when configuration is invalid', async () => {
    const log = makeLog();

    await expect(
      dispatchRegenerationToWorker(input, {
        send: vi.fn(),
        config: () => {
          throw new Error('JOBS_WORKER_URL must be an absolute URL');
        },
        log,
      }),
    ).resolves.toBeUndefined();
    expect(log.error).toHaveBeenCalledTimes(1);
  });
});
