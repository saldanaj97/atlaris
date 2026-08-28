'use client';

import type { FreeAccessPlanCandidate } from '@/features/plans/policy/entitlement';

import { requestJson } from '@/app/_shared/client-api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ROUTES } from '@/features/navigation/routes';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { z } from 'zod';

const selectResponseSchema = z.object({
  planId: z.uuid(),
  selectedAt: z.iso.datetime().nullable().optional(),
});

const GENERATION_STATUS_LABELS: Record<
  FreeAccessPlanCandidate['generationStatus'],
  string
> = {
  generating: 'Generating',
  ready: 'Ready',
  failed: 'Failed',
  pending_retry: 'Pending retry',
};

function generationStatusLabel(
  status: FreeAccessPlanCandidate['generationStatus'],
): string {
  switch (status) {
    case 'generating':
    case 'ready':
    case 'failed':
    case 'pending_retry':
      return GENERATION_STATUS_LABELS[status];
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export function FreeAccessPlanSelector({
  candidates,
}: {
  candidates: readonly FreeAccessPlanCandidate[];
}) {
  const router = useRouter();
  const [planId, setPlanId] = useState(candidates[0]?.id ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!planId) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const response = await requestJson({
        url: '/api/v1/user/free-access-plan',
        init: {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ planId }),
        },
        schema: selectResponseSchema,
        fallbackMessage: 'Could not save your Free plan selection.',
      });
      if (response.kind !== 'success') {
        if (response.kind === 'error') {
          setError(response.message);
        }
        return;
      }
      router.push(`${ROUTES.PLANS.ROOT}/${response.data.planId}`);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className='mx-auto max-w-lg'>
      <CardHeader>
        <CardTitle>Choose the plan to keep on Free</CardTitle>
      </CardHeader>
      <CardContent>
        <p className='mb-4 text-sm text-muted-foreground'>
          Your Free account includes one learning plan. This choice is
          permanent. Other plans stay in your library but stay locked until you
          upgrade.
        </p>
        <form className='space-y-4' onSubmit={onSubmit}>
          <fieldset className='space-y-2'>
            <legend className='sr-only'>Plans you can keep</legend>
            {candidates.map((candidate) => (
              <label
                key={candidate.id}
                htmlFor={`free-access-plan-${candidate.id}`}
                aria-label={candidate.topic}
                className='flex cursor-pointer items-start gap-3 rounded-xl border border-border px-3 py-3 has-checked:border-primary'
              >
                <input
                  id={`free-access-plan-${candidate.id}`}
                  type='radio'
                  name='free-access-plan'
                  value={candidate.id}
                  checked={planId === candidate.id}
                  onChange={() => setPlanId(candidate.id)}
                  className='mt-1 size-4 accent-primary'
                />
                <span className='min-w-0'>
                  <span className='block truncate font-medium'>
                    {candidate.topic}
                  </span>
                  <span className='mt-1 block text-xs text-muted-foreground'>
                    {generationStatusLabel(candidate.generationStatus)} ·{' '}
                    {new Date(candidate.createdAt).toLocaleDateString('en-US', {
                      timeZone: 'UTC',
                    })}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
          {error ? (
            <p className='text-sm text-destructive' role='alert'>
              {error}
            </p>
          ) : null}
          <Button type='submit' disabled={saving || planId.length === 0}>
            {saving ? 'Saving…' : 'Keep this plan'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
