'use client';

import { Pencil } from 'lucide-react';
import Link from 'next/link';
import {
  type ReactElement,
  useCallback,
  useEffect,
  useReducer,
  useRef,
} from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { ProfileFormSkeleton } from '@/app/settings/profile/components/ProfileFormSkeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { parseApiErrorResponse } from '@/lib/api/error-response';
import { clientLogger } from '@/lib/logging/client';

const profileSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  email: z.string(),
  subscriptionTier: z.string(),
  subscriptionStatus: z.string().nullable(),
  createdAt: z.string(),
});

type ProfileData = z.infer<typeof profileSchema>;

interface ProfileFormProps {
  locale?: string;
}

interface ProfileFormState {
  profile: ProfileData | null;
  name: string;
  editingName: boolean;
  loading: boolean;
  saving: boolean;
  error: string | null;
}

type ProfileLoadResult =
  | { kind: 'success'; profile: ProfileData }
  | { kind: 'aborted' }
  | { kind: 'error'; message: string; error: unknown };

type ProfileMutationResult =
  | { kind: 'success'; profile: ProfileData }
  | { kind: 'error'; message: string; error: unknown };

type ApiRequestResult<T> =
  | { kind: 'success'; data: T }
  | { kind: 'aborted' }
  | { kind: 'error'; message: string; error: unknown };

type ProfileFormAction =
  | { type: 'load-started' }
  | { type: 'load-succeeded'; profile: ProfileData }
  | { type: 'load-failed'; message: string }
  | { type: 'start-editing' }
  | { type: 'cancel-editing' }
  | { type: 'stop-editing' }
  | { type: 'name-changed'; name: string }
  | { type: 'save-started' }
  | { type: 'save-succeeded'; profile: ProfileData }
  | { type: 'save-failed' };

const INITIAL_PROFILE_FORM_STATE: ProfileFormState = {
  profile: null,
  name: '',
  editingName: false,
  loading: true,
  saving: false,
  error: null,
};

function getErrorMessage(error: unknown, fallbackMessage: string): string {
  return error instanceof Error ? error.message : fallbackMessage;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function profileFormReducer(
  state: ProfileFormState,
  action: ProfileFormAction
): ProfileFormState {
  switch (action.type) {
    case 'load-started':
      return {
        ...state,
        loading: true,
        error: null,
      };
    case 'load-succeeded':
      return {
        profile: action.profile,
        name: action.profile.name ?? '',
        editingName: false,
        loading: false,
        saving: false,
        error: null,
      };
    case 'load-failed':
      return {
        ...state,
        loading: false,
        error: action.message,
      };
    case 'start-editing':
      return {
        ...state,
        editingName: true,
      };
    case 'stop-editing':
      return {
        ...state,
        editingName: false,
      };
    case 'cancel-editing':
      return {
        ...state,
        name: state.profile?.name ?? '',
        editingName: false,
      };
    case 'name-changed':
      return {
        ...state,
        name: action.name,
      };
    case 'save-started':
      return {
        ...state,
        saving: true,
      };
    case 'save-succeeded':
      return {
        profile: action.profile,
        name: action.profile.name ?? '',
        editingName: false,
        loading: false,
        saving: false,
        error: null,
      };
    case 'save-failed':
      return {
        ...state,
        saving: false,
      };
    default: {
      const _exhaustiveCheck: never = action;
      return _exhaustiveCheck;
    }
  }
}

async function fetchApi<T>(
  url: string,
  options: RequestInit,
  schema: z.ZodType<T>,
  fallbackMessage: string
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

async function requestProfile(
  signal?: AbortSignal
): Promise<ProfileLoadResult> {
  const result = await fetchApi(
    '/api/v1/user/profile',
    { signal },
    profileSchema,
    'Failed to load profile'
  );

  if (result.kind !== 'success') {
    return result;
  }

  return {
    kind: 'success',
    profile: result.data,
  };
}

async function saveProfileName(name: string): Promise<ProfileMutationResult> {
  const result = await fetchApi(
    '/api/v1/user/profile',
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    },
    profileSchema,
    'Failed to update profile'
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

export function ProfileForm({ locale }: ProfileFormProps): ReactElement {
  const [state, dispatch] = useReducer(
    profileFormReducer,
    INITIAL_PROFILE_FORM_STATE
  );
  const profileFetchControllerRef = useRef<AbortController | null>(null);
  const nameInputCallbackRef = useCallback((node: HTMLInputElement | null) => {
    if (node) {
      node.focus();
    }
  }, []);

  const isDirty =
    state.profile !== null && state.name !== (state.profile.name ?? '');

  const fetchProfile = useCallback((): AbortController => {
    const controller = new AbortController();

    dispatch({ type: 'load-started' });

    void (async () => {
      const result = await requestProfile(controller.signal);

      if (controller.signal.aborted || result.kind === 'aborted') {
        return;
      }

      if (result.kind === 'success') {
        dispatch({ type: 'load-succeeded', profile: result.profile });
        return;
      }

      clientLogger.error('Failed to load profile', { error: result.error });
      dispatch({ type: 'load-failed', message: result.message });
      toast.error(result.message);
    })();

    return controller;
  }, []);

  useEffect(() => {
    profileFetchControllerRef.current = fetchProfile();

    return () => {
      profileFetchControllerRef.current?.abort();
    };
  }, [fetchProfile]);

  async function handleSave(): Promise<void> {
    if (!isDirty) return;

    dispatch({ type: 'save-started' });

    const result = await saveProfileName(state.name);

    if (result.kind === 'success') {
      dispatch({ type: 'save-succeeded', profile: result.profile });
      toast.success('Profile updated');
      return;
    }

    clientLogger.error('Failed to update profile', {
      error: result.error,
      submittedName: state.name,
    });
    dispatch({ type: 'save-failed' });
    toast.error(result.message);
  }

  if (state.loading) {
    return <ProfileFormSkeleton />;
  }

  if (state.error || !state.profile) {
    return (
      <Card className="col-span-full space-y-4 p-6">
        <p className="text-muted-foreground text-sm">
          {state.error ?? 'Unable to load profile data.'}
        </p>
        <div>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              profileFetchControllerRef.current?.abort();
              profileFetchControllerRef.current = fetchProfile();
            }}
          >
            Retry
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <>
      {/* Personal Information */}
      <Card className="flex min-h-80 flex-col p-6">
        <h2 className="mb-4 text-xl font-semibold">Personal Information</h2>
        <div className="space-y-4">
          <div>
            <Label
              htmlFor="profile-name"
              className="text-muted-foreground mb-1"
            >
              Name
            </Label>
            {state.editingName ? (
              <Input
                ref={nameInputCallbackRef}
                id="profile-name"
                type="text"
                value={state.name}
                onChange={(event) =>
                  dispatch({ type: 'name-changed', name: event.target.value })
                }
                onBlur={() => {
                  if (!isDirty) {
                    dispatch({ type: 'stop-editing' });
                  }
                }}
              />
            ) : (
              <Button
                type="button"
                variant="outline"
                aria-label="Edit profile name"
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-normal"
                onClick={() => {
                  dispatch({ type: 'start-editing' });
                }}
              >
                <span className={state.name ? '' : 'text-muted-foreground'}>
                  {state.name || 'No name set'}
                </span>
                <Pencil className="text-muted-foreground h-4 w-4 shrink-0" />
              </Button>
            )}
          </div>
          <div>
            <span className="text-muted-foreground mb-1 block text-sm">
              Email
            </span>
            <p className="text-sm">{state.profile.email}</p>
          </div>
        </div>

        {state.editingName && (
          <div className="mt-auto flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="ghost"
              disabled={state.saving}
              onClick={() => {
                dispatch({ type: 'cancel-editing' });
              }}
            >
              Cancel
            </Button>
            {isDirty && (
              <Button
                disabled={state.saving}
                onClick={() => {
                  void handleSave();
                }}
              >
                {state.saving ? 'Saving…' : 'Save Changes'}
              </Button>
            )}
          </div>
        )}
      </Card>

      {/* Account Details */}
      <Card className="p-6">
        <h2 className="mb-4 text-xl font-semibold">Account Details</h2>
        <div className="text-muted-foreground space-y-4 text-sm">
          <div>
            <span className="mb-1 block">Subscription Tier</span>
            <Badge>{state.profile.subscriptionTier}</Badge>
          </div>
          <div>
            <span className="mb-1 block">Status</span>
            <p>{state.profile.subscriptionStatus ?? 'N/A'}</p>
          </div>
          <div>
            <span className="mb-1 block">Member Since</span>
            <p>
              {new Date(state.profile.createdAt).toLocaleDateString(locale, {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </p>
          </div>
          <div className="border-border bg-muted/50 rounded-lg border p-3">
            <p className="text-xs">
              <strong>Note:</strong> To manage your subscription, visit the{' '}
              <Link
                href="/settings/billing"
                className="text-primary underline underline-offset-2"
              >
                billing settings
              </Link>{' '}
              page.
            </p>
          </div>
        </div>
      </Card>
    </>
  );
}
