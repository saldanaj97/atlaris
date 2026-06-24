'use client';

import {
  type ProfileData,
  requestProfile,
  saveProfileName,
} from '@/app/(app)/settings/profile/components/profile-client';
import { ProfileFormSkeleton } from '@/app/(app)/settings/profile/components/ProfileFormSkeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RouteErrorState } from '@/components/ui/route-error-state';
import { clientLogger } from '@/lib/logging/client';
import { Pencil } from 'lucide-react';
import Link from 'next/link';
import { type ReactElement, useEffect, useId, useReducer, useRef } from 'react';
import { toast } from 'sonner';

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

function profileFormReducer(
  state: ProfileFormState,
  action: ProfileFormAction,
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

function fetchProfile(
  dispatch: (action: ProfileFormAction) => void,
): AbortController {
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
}

function focusNameInput(node: HTMLInputElement | null): void {
  if (node) {
    node.focus();
  }
}

export function ProfileForm({ locale }: ProfileFormProps): ReactElement {
  const profileNameId = useId();
  const profileNameLabelId = `${profileNameId}-label`;
  const profileNameInputId = `${profileNameId}-input`;
  const profileNameValueId = `${profileNameId}-value`;

  const [state, dispatch] = useReducer(
    profileFormReducer,
    INITIAL_PROFILE_FORM_STATE,
  );
  const profileFetchControllerRef = useRef<AbortController | null>(null);

  const isDirty =
    state.profile !== null && state.name !== (state.profile.name ?? '');

  useEffect(() => {
    profileFetchControllerRef.current = fetchProfile(dispatch);

    return () => {
      profileFetchControllerRef.current?.abort();
    };
  }, []);

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
    });
    dispatch({ type: 'save-failed' });
    toast.error(result.message);
  }

  if (state.loading) {
    return <ProfileFormSkeleton />;
  }

  if (state.error || !state.profile) {
    return (
      <RouteErrorState
        className='col-span-full'
        title='Unable to load profile'
        message={state.error ?? 'Unable to load profile data.'}
        onRetry={() => {
          profileFetchControllerRef.current?.abort();
          profileFetchControllerRef.current = fetchProfile(dispatch);
        }}
      />
    );
  }

  return (
    <>
      {/* Personal Information */}
      <Card className='flex min-h-80 flex-col'>
        <CardHeader>
          <CardTitle>Personal Information</CardTitle>
        </CardHeader>
        <CardContent className='flex flex-1 flex-col space-y-4'>
          <div className='space-y-2'>
            <Label
              id={profileNameLabelId}
              htmlFor={profileNameInputId}
              className='text-muted-foreground'
            >
              Name
            </Label>
            {state.editingName ? (
              <Input
                ref={focusNameInput}
                id={profileNameInputId}
                type='text'
                value={state.name}
                className='rounded-md'
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
                type='button'
                variant='outline'
                aria-labelledby={`${profileNameLabelId} ${profileNameValueId}`}
                className='flex h-9 w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm font-normal'
                onClick={() => {
                  dispatch({ type: 'start-editing' });
                }}
              >
                <span
                  id={profileNameValueId}
                  className={state.name ? '' : 'text-muted-foreground'}
                >
                  {state.name || 'No name set'}
                </span>
                <Pencil className='size-4 shrink-0 text-muted-foreground' />
              </Button>
            )}
          </div>
          <div>
            <span className='mb-1 block text-sm text-muted-foreground'>
              Email
            </span>
            <p className='text-sm'>{state.profile.email}</p>
          </div>

          {state.editingName && (
            <div className='mt-auto flex justify-end gap-2 pt-4'>
              <Button
                type='button'
                variant='ghost'
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
        </CardContent>
      </Card>

      {/* Account Details */}
      <Card>
        <CardHeader>
          <CardTitle>Account Details</CardTitle>
        </CardHeader>
        <CardContent className='space-y-4 text-sm text-muted-foreground'>
          <div>
            <span className='mb-1 block'>Subscription Tier</span>
            <Badge variant='product'>{state.profile.subscriptionTier}</Badge>
          </div>
          <div>
            <span className='mb-1 block'>Status</span>
            <p>{state.profile.subscriptionStatus ?? 'N/A'}</p>
          </div>
          <div>
            <span className='mb-1 block'>Member Since</span>
            <p>
              {new Date(state.profile.createdAt).toLocaleDateString(locale, {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </p>
          </div>
          <div className='rounded-md border border-border bg-muted/50 p-3'>
            <p className='text-xs'>
              <strong>Note:</strong> To manage your subscription, visit the{' '}
              <Link
                href='/settings/billing'
                className='text-primary underline underline-offset-2'
              >
                billing settings
              </Link>{' '}
              page.
            </p>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
