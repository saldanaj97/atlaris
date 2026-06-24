import type { SubscriptionTier } from '@/shared/types/billing.types';

import { ModelPreferencesSelector } from '@/app/(app)/settings/ai/components/ModelPreferencesSelector';
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
import { ROUTES } from '@/features/navigation/routes';
import { requestBoundary } from '@/lib/api/request-boundary';
import { logger } from '@/lib/logging/logger';
import { redirect } from 'next/navigation';

/**
 * Async component that fetches user subscription data and renders the model selector.
 * Wrapped in Suspense boundary by the parent page.
 */
export async function ModelSelectionCard() {
  const user = await requestBoundary.component(({ actor }) => actor);

  if (!user) {
    redirect(
      `${ROUTES.AUTH.SIGN_IN}?redirect_url=${encodeURIComponent(ROUTES.SETTINGS.AI)}`,
    );
  }

  const userTier: SubscriptionTier = user.subscriptionTier;

  const availableModels = getPersistableModelsForTier(userTier);
  const currentModel = resolveSavedPreferenceForSettings(
    userTier,
    user.preferredAiModel,
  );

  const tierDefaultId = getDefaultModelForTier(userTier);
  const tierDefaultMeta = getModelById(tierDefaultId);
  const tierDefaultLabel = tierDefaultMeta?.name ?? 'your tier default model';

  if (!tierDefaultMeta) {
    logger.warn(
      { userTier, tierDefaultId },
      'Missing tier default model metadata for AI settings card',
    );
  }

  return (
    <Card className='gap-4 py-5 sm:gap-6 sm:py-6'>
      <CardHeader className='px-5 sm:px-6'>
        <CardTitle as='h3'>Model Selection</CardTitle>
        <CardDescription>
          {currentModel !== null ? (
            <>
              New plan generations use this saved choice. A one-off{' '}
              <code className='font-mono text-xs'>?model=</code> request can
              still override a single run.
            </>
          ) : (
            <>
              New plans use <strong>{tierDefaultLabel}</strong> until you save a
              preference. Only persistable models appear here.
            </>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className='px-5 sm:px-6'>
        <ModelPreferencesSelector
          currentModel={currentModel}
          userTier={userTier}
          availableModels={availableModels}
        />
      </CardContent>
    </Card>
  );
}
