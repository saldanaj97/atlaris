'use client';

import Link from 'next/link';
import { useCallback, useEffect, useReducer, type ReactElement } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';

import { Pencil } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { parseApiErrorResponse } from '@/lib/api/error-response';
import { clientLogger } from '@/lib/logging/client';

import { ProfileFormSkeleton } from '@/app/settings/profile/components/ProfileFormSkeleton';

const profileSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  email: z.string(),
  subscriptionTier: z.string(),
  subscriptionStatus: z.string().nullable(),
  createdAt: z.string(),
});

type ProfileData = z.infer<typeof profileSchema>;

interface ProfileFormState {
  profile: ProfileData | null;
  name: string;
  editingName: boolean;
  loading: boolean;
  saving: boolean;
  error: string | null;
}

type ProfileRequestResult =
  | { kind: 'success'; profile: ProfileData }
  | { kind: 'error'; message: string; error: unknown };

type ProfileFormAction =
  | { type: 'load-started' }
  | { type: 'load-succeeded'; profile: ProfileData }
  | { type: 'load-failed'; message: string }
  | { type: 'start-editing' }
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

async function requestProfile(): Promise<ProfileRequestResult> {
  const responseResult = await fetch('/api/v1/user/profile')
    .then((response) => ({ kind: 'response' as const, response }))
    .catch((error: unknown) => ({ kind: 'network-error' as const, error }));

  if (responseResult.kind === 'network-error') {
    return {
      kind: 'error',
      message: getErrorMessage(responseResult.error, 'Failed to load profile'),
      error: responseResult.error,
    };
  }

  const { response } = responseResult;

  if (!response.ok) {
    const parsed = await parseApiErrorResponse(
      response,
      'Failed to load profile'
    );
    return {
      kind: 'error',
      message: parsed.error,
      error: new Error(parsed.error),
    };
  }

  const bodyResult = await response
    .json()
    .then((raw: unknown) => ({ kind: 'body' as const, raw }))
    .catch((error: unknown) => ({ kind: 'parse-error' as const, error }));

  if (bodyResult.kind === 'parse-error') {
    return {
      kind: 'error',
      message: 'Failed to load profile',
      error: bodyResult.error,
    };
  }

  const parsedProfile = profileSchema.safeParse(bodyResult.raw);
  if (!parsedProfile.success) {
    return {
      kind: 'error',
      message:
        parsedProfile.error.issues[0]?.message ?? 'Failed to load profile',
      error: parsedProfile.error,
    };
  }

  return {
    kind: 'success',
    profile: parsedProfile.data,
  };
}

async function saveProfileName(name: string): Promise<ProfileRequestResult> {
  const responseResult = await fetch('/api/v1/user/profile', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
    .then((response) => ({ kind: 'response' as const, response }))
    .catch((error: unknown) => ({ kind: 'network-error' as const, error }));

  if (responseResult.kind === 'network-error') {
    return {
      kind: 'error',
      message: getErrorMessage(
        responseResult.error,
        'Failed to update profile'
      ),
      error: responseResult.error,
    };
  }

  const { response } = responseResult;

  if (!response.ok) {
    const parsed = await parseApiErrorResponse(
      response,
      'Failed to update profile'
    );
    return {
      kind: 'error',
      message: parsed.error,
      error: new Error(parsed.error),
    };
  }

  const bodyResult = await response
    .json()
    .then((raw: unknown) => ({ kind: 'body' as const, raw }))
    .catch((error: unknown) => ({ kind: 'parse-error' as const, error }));

  if (bodyResult.kind === 'parse-error') {
    return {
      kind: 'error',
      message: 'Failed to update profile',
      error: bodyResult.error,
    };
  }

  const parsedProfile = profileSchema.safeParse(bodyResult.raw);
  if (!parsedProfile.success) {
    return {
      kind: 'error',
      message:
        parsedProfile.error.issues[0]?.message ?? 'Failed to update profile',
      error: parsedProfile.error,
    };
  }

  return {
    kind: 'success',
    profile: parsedProfile.data,
  };
}

export function ProfileForm(): ReactElement {
  const [state, dispatch] = useReducer(
    profileFormReducer,
    INITIAL_PROFILE_FORM_STATE
  );
  const nameInputCallbackRef = useCallback((node: HTMLInputElement | null) => {
    if (node) {
      node.focus();
    }
  }, []);

  const isDirty =
    state.profile !== null && state.name !== (state.profile.name ?? '');

  const fetchProfile = useCallback(async () => {
    dispatch({ type: 'load-started' });

    const result = await requestProfile();

    if (result.kind === 'success') {
      dispatch({ type: 'load-succeeded', profile: result.profile });
      return;
    }

    clientLogger.error('Failed to load profile', { error: result.error });
    dispatch({ type: 'load-failed', message: result.message });
    toast.error(result.message);
  }, []);

  useEffect(() => {
    void fetchProfile();
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
      <Card className="col-span-full p-6">
        <p className="text-muted-foreground text-sm">
          {state.error ?? 'Unable to load profile data.'}
        </p>
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
                id="profile-name"
                type="button"
                variant="outline"
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

        {/* Save button pinned to bottom-right of card */}
        {isDirty && (
          <div className="mt-auto flex justify-end pt-4">
            <Button
              disabled={state.saving}
              onClick={() => {
                void handleSave();
              }}
            >
              {state.saving ? 'Saving…' : 'Save Changes'}
            </Button>
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
              {new Date(state.profile.createdAt).toLocaleDateString('en-US', {
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
