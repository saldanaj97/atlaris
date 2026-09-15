'use client';

import {
  type ProfileData,
  requestProfile,
  saveProfileName,
} from '@/app/(app)/settings/profile/components/profile-client';
import { ProfileFormSkeleton } from '@/app/(app)/settings/profile/components/ProfileFormSkeleton';
import { SETTINGS_SECTIONS } from '@/app/(app)/settings/settings-section-ids';
import { APP_SHELL_SCROLL_MARGIN } from '@/components/layout/app-shell-width';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { RouteErrorState } from '@/components/ui/route-error-state';
import { clientLogger } from '@/lib/logging/client';
import { cn } from '@/lib/utils';
import {
  type ReactElement,
  type ReactNode,
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
  loading: boolean;
  saving: boolean;
  error: string | null;
}

type ProfileFormAction =
  | { type: 'load-started' }
  | { type: 'load-succeeded'; profile: ProfileData }
  | { type: 'load-failed'; message: string }
  | { type: 'name-changed'; name: string }
  | { type: 'save-started' }
  | { type: 'save-succeeded'; profile: ProfileData }
  | { type: 'save-failed' };

const INITIAL_PROFILE_FORM_STATE: ProfileFormState = {
  profile: null,
  name: '',
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

function ProfileCard({ children }: { children: ReactNode }): ReactElement {
  return (
    <Card
      as='section'
      id={SETTINGS_SECTIONS.profile}
      className={cn(APP_SHELL_SCROLL_MARGIN, 'gap-[24px] shadow-none')}
    >
      <CardHeader>
        <CardTitle as='h2' className='text-xl leading-[28px]'>
          Profile
        </CardTitle>
      </CardHeader>
      <CardContent className='@container'>{children}</CardContent>
    </Card>
  );
}

export function ProfileForm({ locale }: ProfileFormProps): ReactElement {
  const profileNameInputId = useId();
  const profileEmailInputId = useId();
  const profileEmailHelpId = useId();

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
      <ProfileCard>
        <RouteErrorState
          title='Unable to load profile'
          message={state.error ?? 'Unable to load profile data.'}
          onRetry={() => {
            profileFetchControllerRef.current?.abort();
            profileFetchControllerRef.current = fetchProfile(dispatch);
          }}
        />
      </ProfileCard>
    );
  }

  const memberSince = new Date(state.profile.createdAt).toLocaleDateString(
    locale,
    {
      year: 'numeric',
      month: 'short',
    },
  );
  const email = state.profile.email ?? 'Unavailable';

  return (
    <ProfileCard>
      <div className='space-y-[24px]'>
        <div className='flex min-w-0 items-center justify-between gap-[16px]'>
          <div className='flex min-w-0 items-center gap-[16px]'>
            <div
              aria-hidden='true'
              className='flex size-[64px] shrink-0 items-center justify-center rounded-full border-2 border-primary bg-action-soft text-2xl font-semibold tracking-[-0.01em] text-foreground'
            >
              {getProfileInitials(state.name)}
            </div>
            <div className='min-w-0'>
              <p className='text-xl leading-[28px] font-semibold [overflow-wrap:anywhere] text-foreground'>
                {state.name || 'No name set'}
              </p>
              <p className='text-sm leading-[22px] [overflow-wrap:anywhere] text-muted-foreground'>
                {email}
              </p>
              <p className='text-xs leading-[18px] text-muted-foreground'>
                Member since <span>{memberSince}</span>
              </p>
            </div>
          </div>
        </div>

        <div className='grid min-w-0 gap-[16px] @min-[34rem]:grid-cols-2'>
          <div className='min-w-0 space-y-[8px]'>
            <label
              htmlFor={profileNameInputId}
              className='text-sm leading-[20px] font-medium text-foreground'
            >
              Display name
            </label>
            <Input
              id={profileNameInputId}
              type='text'
              value={state.name}
              aria-label='Name'
              onChange={(event) =>
                dispatch({ type: 'name-changed', name: event.target.value })
              }
            />
          </div>
          <div className='min-w-0 space-y-[8px]'>
            <label
              htmlFor={profileEmailInputId}
              className='text-sm leading-[20px] font-medium text-foreground'
            >
              Email address
            </label>
            <Input
              id={profileEmailInputId}
              type='email'
              value={email}
              readOnly
              aria-describedby={profileEmailHelpId}
            />
            <p
              id={profileEmailHelpId}
              className='text-xs leading-[18px] text-muted-foreground'
            >
              Your email address is managed by your sign-in provider.
            </p>
          </div>
        </div>

        <div className='flex justify-end'>
          <Button
            disabled={!isDirty || state.saving}
            onClick={() => {
              void handleSave();
            }}
          >
            {state.saving ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </div>
    </ProfileCard>
  );
}
