import { buildProfile } from '../../../fixtures/profile';
import {
  requestProfile,
  saveProfileName,
} from '@/app/(app)/settings/profile/components/profile-client';
import { describe, expect, it, vi, afterEach } from 'vitest';

const PROFILE = buildProfile();

function mockJsonResponse(
  body: unknown,
  options?: { ok?: boolean; status?: number },
) {
  return {
    ok: options?.ok ?? true,
    status: options?.status ?? 200,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(JSON.stringify(body)),
  };
}

describe('profile-client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads and validates profile data from the profile endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse(PROFILE));
    vi.stubGlobal('fetch', fetchMock);

    const result = await requestProfile();

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/user/profile', {
      signal: undefined,
    });
    expect(result).toEqual({ kind: 'success', profile: PROFILE });
  });

  it('rejects malformed profile responses instead of accepting partial data', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        mockJsonResponse({
          id: PROFILE.id,
          name: PROFILE.name,
        }),
      ),
    );

    const result = await requestProfile();

    expect(result.kind).toBe('error');
    if (result.kind === 'error') {
      expect(result.error).toBeInstanceOf(Error);
      expect(result.message).not.toHaveLength(0);
    }
  });

  it('saves profile names with a PUT request and returns the validated profile', async () => {
    const updatedProfile = { ...PROFILE, name: 'Grace Hopper' };
    const fetchMock = vi
      .fn()
      .mockResolvedValue(mockJsonResponse(updatedProfile));
    vi.stubGlobal('fetch', fetchMock);

    const result = await saveProfileName('Grace Hopper');

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/user/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Grace Hopper' }),
    });
    expect(result).toEqual({ kind: 'success', profile: updatedProfile });
  });
});
