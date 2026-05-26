'use client';

import {
  type ProfileData,
  requestProfile,
  saveProfileName,
} from '@/app/(app)/settings/profile/components/profile-client';
import { ProfileFormSkeleton } from '@/app/(app)/settings/profile/components/ProfileFormSkeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { clientLogger } from '@/lib/logging/client';
import { Pencil } from 'lucide-react';
import Link from 'next/link';
import {
  type ReactElement,
  useCallback,
  useEffect,
  useId,
  useReducer,
  useRef,
} from 'react';
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
      <Card className='col-span-full space-y-4 p-6'>
        <p className='text-sm text-muted-foreground'>
          {state.error ?? 'Unable to load profile data.'}
        </p>
        <div>
          <Button
            type='button'
            variant='outline'
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
      <Card className='flex min-h-80 flex-col p-6'>
        <h2 className='mb-4 text-xl font-semibold'>Personal Information</h2>
        <div className='space-y-4'>
          <div>
            <Label
              id={profileNameLabelId}
              htmlFor={profileNameInputId}
              className='mb-1 text-muted-foreground'
            >
              Name
            </Label>
            {state.editingName ? (
              <Input
                ref={nameInputCallbackRef}
                id={profileNameInputId}
                type='text'
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
                type='button'
                variant='outline'
                aria-labelledby={`${profileNameLabelId} ${profileNameValueId}`}
                className='flex w-full items-center justify-between px-3 py-2 text-left text-sm font-normal'
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
      </Card>

      {/* Account Details */}
      <Card className='p-6'>
        <h2 className='mb-4 text-xl font-semibold'>Account Details</h2>
        <div className='space-y-4 text-sm text-muted-foreground'>
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
          <div className='rounded-lg border border-border bg-muted/50 p-3'>
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
        </div>
      </Card>
    </>
  );
}
