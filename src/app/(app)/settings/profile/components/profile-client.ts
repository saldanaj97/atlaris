import { z } from 'zod';
import { parseApiErrorResponse } from '@/lib/api/error-response';
import { isAbortError } from '@/lib/errors';

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

type ApiRequestResult<T> =
  | { kind: 'success'; data: T }
  | { kind: 'aborted' }
  | { kind: 'error'; message: string; error: unknown };

function getErrorMessage(error: unknown, fallbackMessage: string): string {
  return error instanceof Error ? error.message : fallbackMessage;
}

async function fetchApi<T>(
  url: string,
  options: RequestInit,
  schema: z.ZodType<T>,
  fallbackMessage: string,
): Promise<ApiRequestResult<T>> {
  let response: Response;

  try {
    response = await fetch(url, options);
  } catch (error: unknown) {
    if (isAbortError(error)) {
      return { kind: 'aborted' };
    }

    return {
      kind: 'error',
      message: getErrorMessage(error, fallbackMessage),
      error,
    };
  }

  if (!response.ok) {
    const parsed = await parseApiErrorResponse(response, fallbackMessage);
    return {
      kind: 'error',
      message: parsed.error,
      error: new Error(parsed.error),
    };
  }

  let rawBody: unknown;

  try {
    rawBody = await response.json();
  } catch (error: unknown) {
    if (isAbortError(error)) {
      return { kind: 'aborted' };
    }

    return {
      kind: 'error',
      message: fallbackMessage,
      error,
    };
  }

  const parsedData = schema.safeParse(rawBody);
  if (!parsedData.success) {
    return {
      kind: 'error',
      message: parsedData.error.issues[0]?.message ?? fallbackMessage,
      error: parsedData.error,
    };
  }

  return {
    kind: 'success',
    data: parsedData.data,
  };
}

export async function requestProfile(
  signal?: AbortSignal,
): Promise<ProfileLoadResult> {
  const result = await fetchApi(
    '/api/v1/user/profile',
    { signal },
    profileSchema,
    'Failed to load profile',
  );

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
  const result = await fetchApi(
    '/api/v1/user/profile',
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    },
    profileSchema,
    'Failed to update profile',
  );

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
