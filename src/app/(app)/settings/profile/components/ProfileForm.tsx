'use client';

import {
  type ProfileData,
  requestProfile,
  saveProfileName,
} from '@/app/(app)/settings/profile/components/profile-client';
import { ProfileFormSkeleton } from '@/app/(app)/settings/profile/components/ProfileFormSkeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RouteErrorState } from '@/components/ui/route-error-state';
import { clientLogger } from '@/lib/logging/client';
import { Pencil } from 'lucide-react';
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

function getProfileInitials(name: string): string {
  const initials = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

  return initials || '?';
}

export function ProfileForm({ locale }: ProfileFormProps): ReactElement {
  const profileNameInputId = useId();

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
        title='Unable to load profile'
        message={state.error ?? 'Unable to load profile data.'}
        onRetry={() => {
          profileFetchControllerRef.current?.abort();
          profileFetchControllerRef.current = fetchProfile(dispatch);
        }}
      />
    );
  }

  const memberSince = new Date(state.profile.createdAt).toLocaleDateString(
    locale,
    {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    },
  );

  return (
    <div className='space-y-5'>
      <div className='rounded-xl border border-panel-border bg-panel-muted/30 p-4 sm:p-5'>
        {state.editingName ? (
          <div className='space-y-3'>
            <label
              htmlFor={profileNameInputId}
              className='text-sm font-medium text-foreground'
            >
              Display name
            </label>
            <div className='flex flex-col gap-3 sm:flex-row sm:items-center'>
              <Input
                ref={focusNameInput}
                id={profileNameInputId}
                type='text'
                value={state.name}
                aria-label='Name'
                className='min-w-0 flex-1'
                onChange={(event) =>
                  dispatch({ type: 'name-changed', name: event.target.value })
                }
                onBlur={() => {
                  if (!isDirty) {
                    dispatch({ type: 'stop-editing' });
                  }
                }}
              />
              <div className='flex shrink-0 items-center gap-2'>
                <Button
                  type='button'
                  variant='ghost'
                  size='sm'
                  disabled={state.saving}
                  onClick={() => {
                    dispatch({ type: 'cancel-editing' });
                  }}
                >
                  Cancel
                </Button>
                {isDirty ? (
                  <Button
                    size='sm'
                    disabled={state.saving}
                    onClick={() => {
                      void handleSave();
                    }}
                  >
                    {state.saving ? 'Saving…' : 'Save Changes'}
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        ) : (
          <div className='flex min-w-0 items-start gap-4'>
            <div
              aria-hidden='true'
              className='flex size-12 shrink-0 items-center justify-center rounded-full border border-primary/60 bg-primary/10 text-base font-semibold text-primary'
            >
              {getProfileInitials(state.name)}
            </div>
            <div className='min-w-0 flex-1'>
              <div className='flex flex-wrap items-center gap-2'>
                <button
                  type='button'
                  className='max-w-full min-w-0 text-left text-base font-semibold break-words text-foreground hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-panel focus-visible:outline-none'
                  onClick={() => {
                    dispatch({ type: 'start-editing' });
                  }}
                >
                  {state.name || 'No name set'}
                </button>
                <Button
                  type='button'
                  variant='ghost'
                  size='icon-sm'
                  aria-label='Edit name'
                  onClick={() => {
                    dispatch({ type: 'start-editing' });
                  }}
                >
                  <Pencil />
                </Button>
              </div>
              <p className='mt-1 text-sm break-words text-muted-foreground'>
                {state.profile.email ?? 'Unavailable'}
              </p>
              <p className='mt-1 text-xs text-muted-foreground'>
                Member since <span>{memberSince}</span>
              </p>
            </div>
          </div>
        )}
      </div>

      <p className='text-xs leading-relaxed text-muted-foreground'>
        Your email address is managed by your sign-in provider.
      </p>
    </div>
  );
}
