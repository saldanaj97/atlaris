import { requestJson } from '@/app/_shared/client-api';
import { z } from 'zod';

const profileSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  email: z.string(),
  subscriptionTier: z.string(),
  subscriptionStatus: z.string().nullable(),
  createdAt: z.string(),
});

export type ProfileData = z.infer<typeof profileSchema>;

export type ProfileLoadResult =
  | { kind: 'success'; profile: ProfileData }
  | { kind: 'aborted' }
  | { kind: 'error'; message: string; error: unknown };

export type ProfileMutationResult =
  | { kind: 'success'; profile: ProfileData }
  | { kind: 'error'; message: string; error: unknown };

export async function requestProfile(
  signal?: AbortSignal,
): Promise<ProfileLoadResult> {
  const result = await requestJson({
    url: '/api/v1/user/profile',
    init: { signal },
    schema: profileSchema,
    fallbackMessage: 'Failed to load profile',
  });

  if (result.kind !== 'success') {
    return result;
  }

  return {
    kind: 'success',
    profile: result.data,
  };
}

export async function saveProfileName(
  name: string,
): Promise<ProfileMutationResult> {
  const result = await requestJson({
    url: '/api/v1/user/profile',
    init: {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    },
    schema: profileSchema,
    fallbackMessage: 'Failed to update profile',
  });

  if (result.kind !== 'success') {
    if (result.kind === 'aborted') {
      return {
        kind: 'error',
        message: 'Failed to update profile',
        error: new Error('Unexpected aborted profile update request'),
      };
    }

    return result;
  }

  return {
    kind: 'success',
    profile: result.data,
  };
}
