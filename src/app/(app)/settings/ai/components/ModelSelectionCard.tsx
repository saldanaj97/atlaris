import type { SubscriptionTier } from '@/shared/types/billing.types';

import { ModelPreferencesSelector } from '@/app/(app)/settings/ai/components/ModelPreferencesSelector';
import { Button } from '@/components/ui/button';
import { RouteEmptyState } from '@/components/ui/route-empty-state';
import { getDefaultModelForTier, getModelById } from '@/features/ai/ai-models';
import {
  getPersistableModelsForTier,
  resolveSavedPreferenceForSettings,
} from '@/features/ai/model-preferences';
import { ROUTES } from '@/features/navigation/routes';
import { requestBoundary } from '@/lib/api/request-boundary';
import { logger } from '@/lib/logging/logger';
import { AlertCircle } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';

/**
 * Async component that fetches user subscription data and renders the model selector.
 */
export async function ModelSelectionCard() {
  const user = await requestBoundary.component(({ actor }) => actor);

  if (!user) {
    redirect(
      `${ROUTES.AUTH.SIGN_IN}?redirect_url=${encodeURIComponent(`${ROUTES.SETTINGS.ROOT}#ai`)}`,
    );
  }

  const userTier: SubscriptionTier = user.subscriptionTier;

  switch (userTier) {
    case 'free':
      return (
        <div className='py-3.5 first:pt-0 last:pb-0'>
          <RouteEmptyState
            icon={AlertCircle}
            title='No model picker on Free'
            description='Free plans always use the OpenRouter free router. Upgrade to Starter or Pro to save a model preference.'
            action={
              <Button asChild variant='default'>
                <Link href={ROUTES.PRICING}>View pricing plans</Link>
              </Button>
            }
          />
        </div>
      );
    case 'starter': {
      const availableModels = getPersistableModelsForTier(
        userTier,
        'initial_outline',
      );
      const currentModel = resolveSavedPreferenceForSettings(
        userTier,
        user.preferredAiModel,
        'initial_outline',
      );
      const tierDefaultId = getDefaultModelForTier(userTier, 'initial_outline');
      const tierDefaultMeta = getModelById(tierDefaultId);
      const tierDefaultLabel =
        tierDefaultMeta?.name ?? 'your tier default model';

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
                New plan generations and regenerations use this saved choice. A
                one-off <code className='font-mono text-xs'>?model=</code>{' '}
                request can still override a single run.
              </>
            ) : (
              <>
                New plans use <strong>{tierDefaultLabel}</strong> until you save
                a preference. Only persistable models appear here.
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
    case 'pro': {
      const outlineModels = getPersistableModelsForTier(
        userTier,
        'initial_outline',
      );
      const regenerationModels = getPersistableModelsForTier(
        userTier,
        'regeneration',
      );
      const lessonModels = getPersistableModelsForTier(userTier, 'lesson');
      const outlineModel = resolveSavedPreferenceForSettings(
        userTier,
        user.preferredAiModel,
        'initial_outline',
      );
      const regenerationModel = resolveSavedPreferenceForSettings(
        userTier,
        user.preferredRegenerationAiModel,
        'regeneration',
      );
      const lessonModel = resolveSavedPreferenceForSettings(
        userTier,
        user.preferredLessonAiModel,
        'lesson',
      );

      return (
        <div className='space-y-8 py-3.5 first:pt-0 last:pb-0'>
          <p className='text-xs text-muted-foreground'>
            Save a default for outline generation, full-plan regeneration, and
            detailed lessons. Restore default clears only that slot.
          </p>
          <ModelPreferencesSelector
            currentModel={outlineModel}
            userTier={userTier}
            availableModels={outlineModels}
            preferenceField='preferredAiModel'
            label='Preferred outline model'
            showUpgradeCta={false}
          />
          <ModelPreferencesSelector
            currentModel={regenerationModel}
            userTier={userTier}
            availableModels={regenerationModels}
            preferenceField='preferredRegenerationAiModel'
            label='Preferred regeneration model'
            showUpgradeCta={false}
          />
          <ModelPreferencesSelector
            currentModel={lessonModel}
            userTier={userTier}
            availableModels={lessonModels}
            preferenceField='preferredLessonAiModel'
            label='Preferred lesson model'
            showUpgradeCta={false}
          />
        </div>
      );
    }
    default: {
      const _never: never = userTier;
      throw new Error(`Unhandled subscription tier: ${String(_never)}`);
    }
  }
}
