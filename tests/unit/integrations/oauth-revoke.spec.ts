import { afterEach, describe, expect, it, vi } from 'vitest';

import { revokeGoogleTokens } from '@/lib/integrations/oauth';

describe('revokeGoogleTokens', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls Google revoke endpoint with form-encoded token', async () => {
    const fetchMock = vi
      .fn<(..._args: unknown[]) => Promise<Response>>()
      .mockResolvedValue(new Response(null, { status: 200 }));

    await revokeGoogleTokens('abc123', fetchMock as typeof fetch);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://oauth2.googleapis.com/revoke',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      })
    );

    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(requestInit?.body).toBe('token=abc123');
  });

  it('does not throw when revoke endpoint returns non-2xx', async () => {
    const fetchMock = vi
      .fn<(..._args: unknown[]) => Promise<Response>>()
      .mockResolvedValue(new Response(null, { status: 400 }));

    await expect(
      revokeGoogleTokens('stale-token', fetchMock as typeof fetch)
    ).resolves.toBeUndefined();
  });

  it('does not throw when fetch fails', async () => {
    const fetchMock = vi
      .fn<(..._args: unknown[]) => Promise<Response>>()
      .mockRejectedValue(new Error('network down'));

    await expect(
      revokeGoogleTokens('stale-token', fetchMock as typeof fetch)
    ).resolves.toBeUndefined();
  });
});
