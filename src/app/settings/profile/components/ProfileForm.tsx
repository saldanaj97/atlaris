'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { parseApiErrorResponse } from '@/lib/api/error-response';

interface ProfileData {
  id: string;
  name: string;
  email: string;
  subscriptionTier: string;
  subscriptionStatus: string;
  createdAt: string;
}

export function ProfileForm(): React.ReactElement {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isDirty = profile !== null && name !== profile.name;

  const fetchProfile = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch('/api/v1/user/profile');

      if (!res.ok) {
        const parsed = await parseApiErrorResponse(
          res,
          'Failed to load profile'
        );
        throw new Error(parsed.error);
      }

      const data = (await res.json()) as ProfileData;
      setProfile(data);
      setName(data.name);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to load profile';
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchProfile();
  }, [fetchProfile]);

  async function handleSave(): Promise<void> {
    if (!isDirty) return;

    try {
      setSaving(true);

      const res = await fetch('/api/v1/user/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });

      if (!res.ok) {
        const parsed = await parseApiErrorResponse(
          res,
          'Failed to update profile'
        );
        throw new Error(parsed.error);
      }

      const data = (await res.json()) as ProfileData;
      setProfile(data);
      setName(data.name);
      toast.success('Profile updated');
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to update profile';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <ProfileFormSkeleton />;
  }

  if (error || !profile) {
    return (
      <Card className="col-span-full p-6">
        <p className="text-muted-foreground text-sm">
          {error ?? 'Unable to load profile data.'}
        </p>
      </Card>
    );
  }

  return (
    <>
      {/* Personal Information */}
      <Card className="p-6">
        <h2 className="mb-4 text-xl font-semibold">Personal Information</h2>
        <div className="space-y-4">
          <div>
            <label
              htmlFor="profile-name"
              className="text-muted-foreground mb-1 block text-sm"
            >
              Name
            </label>
            <input
              id="profile-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="border-input bg-background focus:border-primary focus:ring-primary/20 w-full rounded-lg border px-3 py-2 text-sm transition outline-none focus:ring-2"
            />
          </div>
          <div>
            <span className="text-muted-foreground mb-1 block text-sm">
              Email
            </span>
            <p className="text-sm">{profile.email}</p>
          </div>
          <Button
            disabled={!isDirty || saving}
            onClick={() => {
              void handleSave();
            }}
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </Button>
        </div>
      </Card>

      {/* Account Details */}
      <Card className="p-6">
        <h2 className="mb-4 text-xl font-semibold">Account Details</h2>
        <div className="text-muted-foreground space-y-4 text-sm">
          <div>
            <span className="mb-1 block">Subscription Tier</span>
            <Badge>{profile.subscriptionTier}</Badge>
          </div>
          <div>
            <span className="mb-1 block">Status</span>
            <p>{profile.subscriptionStatus}</p>
          </div>
          <div>
            <span className="mb-1 block">Member Since</span>
            <p>
              {new Date(profile.createdAt).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </p>
          </div>
          <div className="border-border bg-muted/50 rounded-lg border p-3">
            <p className="text-xs">
              <strong>Note:</strong> To manage your subscription, visit the{' '}
              <a
                href="/settings/billing"
                className="text-primary underline underline-offset-2"
              >
                billing settings
              </a>{' '}
              page.
            </p>
          </div>
        </div>
      </Card>
    </>
  );
}

export function ProfileFormSkeleton(): React.ReactElement {
  return (
    <>
      <Card className="p-6">
        <Skeleton className="mb-4 h-7 w-48" />
        <div className="space-y-4">
          <div>
            <Skeleton className="mb-1 h-4 w-12" />
            <Skeleton className="h-9 w-full rounded-lg" />
          </div>
          <div>
            <Skeleton className="mb-1 h-4 w-12" />
            <Skeleton className="h-4 w-40" />
          </div>
          <Skeleton className="h-9 w-28" />
        </div>
      </Card>
      <Card className="p-6">
        <Skeleton className="mb-4 h-7 w-40" />
        <div className="space-y-4">
          <div>
            <Skeleton className="mb-1 h-4 w-32" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
          <div>
            <Skeleton className="mb-1 h-4 w-16" />
            <Skeleton className="h-4 w-20" />
          </div>
          <div>
            <Skeleton className="mb-1 h-4 w-28" />
            <Skeleton className="h-4 w-36" />
          </div>
          <Skeleton className="h-16 w-full rounded-lg" />
        </div>
      </Card>
    </>
  );
}
