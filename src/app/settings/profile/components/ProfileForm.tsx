'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';

import { Pencil } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { parseApiErrorResponse } from '@/lib/api/error-response';

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

export function ProfileForm(): React.ReactElement {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [name, setName] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const isDirty = profile !== null && name !== (profile.name ?? '');

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

      const raw: unknown = await res.json();
      const data = profileSchema.parse(raw);
      setProfile(data);
      setName(data.name ?? '');
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

      const raw: unknown = await res.json();
      const data = profileSchema.parse(raw);
      setProfile(data);
      setName(data.name ?? '');
      setEditingName(false);
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
            {editingName ? (
              <Input
                ref={nameInputRef}
                id="profile-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => {
                  if (!isDirty) setEditingName(false);
                }}
                autoFocus
              />
            ) : (
              <Button
                id="profile-name"
                type="button"
                variant="outline"
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-normal"
                onClick={() => {
                  setEditingName(true);
                }}
              >
                <span className={name ? '' : 'text-muted-foreground'}>
                  {name || 'No name set'}
                </span>
                <Pencil className="text-muted-foreground h-4 w-4 shrink-0" />
              </Button>
            )}
          </div>
          <div>
            <span className="text-muted-foreground mb-1 block text-sm">
              Email
            </span>
            <p className="text-sm">{profile.email}</p>
          </div>
        </div>

        {/* Save button pinned to bottom-right of card */}
        {isDirty && (
          <div className="mt-auto flex justify-end pt-4">
            <Button
              disabled={saving}
              onClick={() => {
                void handleSave();
              }}
            >
              {saving ? 'Saving…' : 'Save Changes'}
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
            <Badge>{profile.subscriptionTier}</Badge>
          </div>
          <div>
            <span className="mb-1 block">Status</span>
            <p>{profile.subscriptionStatus ?? 'N/A'}</p>
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
