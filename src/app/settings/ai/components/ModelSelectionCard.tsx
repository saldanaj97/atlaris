import { redirect } from 'next/navigation';
import type { JSX } from 'react';
import { ModelPreferencesSelector } from '@/app/settings/ai/components/ModelPreferencesSelector';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { getDefaultModelForTier, getModelById } from '@/features/ai/ai-models';
import {
  getPersistableModelsForTier,
  resolveSavedPreferenceForSettings,
} from '@/features/ai/model-preferences';
import type { SubscriptionTier } from '@/features/ai/types/model.types';
import { withServerComponentContext } from '@/lib/api/auth';

/**
 * Async component that fetches user subscription data and renders the model selector.
 * Wrapped in Suspense boundary by the parent page.
 */
export async function ModelSelectionCard(): Promise<JSX.Element> {
  const user = await withServerComponentContext((u) => u);

  if (!user) redirect('/auth/sign-in');

  const userTier: SubscriptionTier = user.subscriptionTier;

  const availableModels = getPersistableModelsForTier(userTier);
  const currentModel = resolveSavedPreferenceForSettings(
    userTier,
    user.preferredAiModel
  );

  const tierDefaultId = getDefaultModelForTier(userTier);
  const tierDefaultMeta = getModelById(tierDefaultId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Model Selection</CardTitle>
        <CardDescription>
          {currentModel != null ? (
            <>
              Your saved choice is used for new plan generations. You can still
              use a one-off <code className="font-mono text-xs">?model=</code>{' '}
              query on a generation request to override it for that run only.
            </>
          ) : (
            <>
              No explicit preference saved yet. New plans use{' '}
              <strong>{tierDefaultMeta?.name ?? tierDefaultId}</strong> (the
              default for your tier). Save a model below to store a preference.
              The list only includes models you can persist; the automatic
              router fallback is not listed here.
            </>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ModelPreferencesSelector
          currentModel={currentModel}
          userTier={userTier}
          availableModels={availableModels}
        />
      </CardContent>
    </Card>
  );
}
