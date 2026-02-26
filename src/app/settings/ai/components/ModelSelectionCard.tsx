import { ModelSelector } from '@/components/settings/model-selector';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
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
    return { sub, preferredAiModel: user.preferredAiModel };
  });

  if (!result) redirect('/auth/sign-in');

  const userTier: SubscriptionTier =
    result.sub.subscriptionTier === 'starter'
      ? 'starter'
      : result.sub.subscriptionTier === 'pro'
        ? 'pro'
        : 'free';

  // TODO: [OPENROUTER-MIGRATION] Get user's preferred model from database when column exists:
  // const userPreferredModel = result.preferredAiModel;
  const userPreferredModel = null;

  return (
    <Card className="p-6">
      <h2 className="mb-4 text-xl font-semibold">Model Selection</h2>
      <ModelSelector
        currentModel={userPreferredModel}
        userTier={userTier}
        // TODO: [OPENROUTER-MIGRATION] Implement onSave when API is ready
        onSave={undefined}
      />
      <p className="text-muted-foreground mt-2 text-sm">
        Model preference saving will be available soon.
      </p>
    </Card>
  );
}

/**
 * Skeleton for the Model Selection card.
 * Shown while the async component is loading.
 */
export function ModelSelectionCardSkeleton(): JSX.Element {
  return (
    <Card className="p-6">
      <Skeleton className="mb-4 h-6 w-36" />

      {/* Model selector dropdown skeleton */}
      <Skeleton className="mb-4 h-10 w-full rounded-md" />

      {/* Model cards skeleton */}
      <div className="space-y-3">
        {[1, 2, 3].map((modelSkeletonId) => (
          <div
            key={`model-skeleton-${modelSkeletonId}`}
            className="rounded-lg border p-3"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Skeleton className="h-8 w-8 rounded-lg" />
                <div>
                  <Skeleton className="mb-1 h-4 w-32" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </div>
              <Skeleton className="h-5 w-12 rounded-full" />
            </div>
          </div>
        ))}
      </div>

      <Skeleton className="mt-4 h-4 w-56" />
    </Card>
  );
}
