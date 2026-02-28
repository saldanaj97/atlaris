import { ModelSelector } from '@/components/settings/model-selector';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import type { SubscriptionTier } from '@/lib/ai/types/model.types';
import { withServerComponentContext } from '@/lib/api/auth';
import { getDb } from '@/lib/db/runtime';
import { getSubscriptionTier } from '@/lib/stripe/subscriptions';
import { redirect } from 'next/navigation';
import type { JSX } from 'react';

/**
 * Async component that fetches user subscription data and renders the model selector.
 * Wrapped in Suspense boundary by the parent page.
 */
export async function ModelSelectionCard(): Promise<JSX.Element> {
  const result = await withServerComponentContext(async (user) => {
    const db = getDb();
    const sub = await getSubscriptionTier(user.id, db);
    return { sub };
  });

  if (!result) redirect('/auth/sign-in');

  const userTier: SubscriptionTier =
    result.sub.subscriptionTier === 'starter'
      ? 'starter'
      : result.sub.subscriptionTier === 'pro'
        ? 'pro'
        : 'free';

  // TODO: [OPENROUTER-MIGRATION] Get user's preferred model from database when column exists
  const userPreferredModel = null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Model Selection</CardTitle>
        <CardDescription>
          Model preference saving will be available soon.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ModelSelector
          currentModel={userPreferredModel}
          userTier={userTier}
          // TODO: [OPENROUTER-MIGRATION] Implement onSave when API is ready
          onSave={undefined}
        />
      </CardContent>
    </Card>
  );
}
