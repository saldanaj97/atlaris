import { deletePostHogPersons } from '@/lib/posthog/delete-person';
import { describe, expect, it, vi } from 'vitest';

const AUTH_USER_IDS = ['user_deleted_a', 'user_deleted_b'];

async function run(respond: () => Promise<Response>) {
  const fetchImpl = vi.fn(respond);
  const logger = { error: vi.fn(), info: vi.fn() };
  const accepted = await deletePostHogPersons(AUTH_USER_IDS, {
    apiKey: 'phx_test',
    logger,
    fetchImpl: fetchImpl as unknown as typeof fetch,
  });
  return { accepted, fetchImpl, logger };
}

describe('deletePostHogPersons', () => {
  it('bulk deletes the persons, events and recordings in the production project', async () => {
    const { accepted, fetchImpl, logger } = await run(() =>
      Promise.resolve(new Response(null, { status: 202 })),
    );

    expect(accepted).toBe(true);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit & { headers: Record<string, string>; body: string },
    ];
    expect(url).toBe(
      'https://us.posthog.com/api/projects/551450/persons/bulk_delete/',
    );
    expect(init.headers.authorization).toBe('Bearer phx_test');
    expect(JSON.parse(init.body)).toEqual({
      distinct_ids: AUTH_USER_IDS,
      delete_events: true,
      delete_recordings: true,
    });
    expect(logger.error).not.toHaveBeenCalled();
  });

  it.each([
    [
      'a non-2xx response',
      () => Promise.resolve(new Response(null, { status: 403 })),
    ],
    ['a network error', () => Promise.reject(new Error('timeout'))],
  ])('logs and returns false on %s', async (_label, respond) => {
    const { accepted, logger } = await run(respond);

    expect(accepted).toBe(false);
    expect(logger.error).toHaveBeenCalledTimes(1);
  });
});
