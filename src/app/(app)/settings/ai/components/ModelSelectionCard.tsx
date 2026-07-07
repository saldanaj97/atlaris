import type { SubscriptionTier } from '@/shared/types/billing.types';

import { ModelPreferencesSelector } from '@/app/(app)/settings/ai/components/ModelPreferencesSelector';
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
    <div className='py-3.5 first:pt-0 last:pb-0'>
      <p className='mb-4 text-xs text-muted-foreground'>
        {currentModel !== null ? (
          <>
            New plan generations use this saved choice. A one-off{' '}
            <code className='font-mono text-xs'>?model=</code> request can still
            override a single run.
          </>
        ) : (
          <>
            New plans use <strong>{tierDefaultLabel}</strong> until you save a
            preference. Only persistable models appear here.
          </>
        )}
      </p>
      <ModelPreferencesSelector
        currentModel={currentModel}
        userTier={userTier}
        availableModels={availableModels}
      />
    </div>
  );
}
