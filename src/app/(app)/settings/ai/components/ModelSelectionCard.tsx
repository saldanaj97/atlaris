import type { GroundedModelOption } from '@/app/(app)/settings/ai/components/GroundedModelPicker';
import type {
  GroundedPickRole,
  SavedGroundedModelPicks,
} from '@/features/ai/model-preferences';
import type { SubscriptionTier } from '@/shared/types/billing.types';

import { GroundedModelPicker } from '@/app/(app)/settings/ai/components/GroundedModelPicker';
import { ModelPreferencesSelector } from '@/app/(app)/settings/ai/components/ModelPreferencesSelector';
import { Button } from '@/components/ui/button';
import { RouteEmptyState } from '@/components/ui/route-empty-state';
import { getDefaultModelForTier, getModelById } from '@/features/ai/ai-models';
import { isGroundedEnabled } from '@/features/ai/grounded-generation-flag';
import {
  GROUNDED_PICK_FIELD_BY_ROLE,
  GROUNDED_PICK_ROLES,
  getGroundedPickCatalog,
  getGroundedPickDefault,
  getPersistableModelsForTier,
  resolveGroundedModelPick,
  resolveSavedPreferenceForSettings,
} from '@/features/ai/model-preferences';
import { ROUTES } from '@/features/navigation/routes';
import { requestBoundary } from '@/lib/api/request-boundary';
import { getGroundedModelPreferences } from '@/lib/db/queries/user-preferences';
import { logger } from '@/lib/logging/logger';
import { AlertCircle } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';

const GROUNDED_PICK_COPY = {
  writer: {
    label: 'Writer model',
    description: 'Writes outlines, regenerations, and lessons.',
  },
  verifier: {
    label: 'Verifier model',
    description: 'Checks each outline against its research sources.',
  },
  advisor: {
    label: 'Advisor model',
    description: 'Suggests fixes when the verifier finds problems.',
  },
} as const satisfies Record<
  GroundedPickRole,
  { label: string; description: string }
>;

function groundedModelLabel(modelId: string): string {
  return getModelById(modelId)?.name ?? modelId;
}

/**
 * Async component that fetches user subscription data and renders the model selector.
 */
export async function ModelSelectionCard() {
  const result = await requestBoundary.component(async ({ actor, db }) => ({
    user: actor,
    groundedPicks:
      actor.subscriptionTier === 'pro' && (await isGroundedEnabled('pro'))
        ? await getGroundedModelPreferences(actor.id, db)
        : null,
  }));

  if (!result) {
    redirect(
      `${ROUTES.AUTH.SIGN_IN}?redirect_url=${encodeURIComponent(ROUTES.SETTINGS.AI)}`,
    );
  }

  const { user, groundedPicks } = result;

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
          <p className='mb-4 type-meta text-muted-foreground'>
            {currentModel !== null ? (
              <>
                New plan generations and regenerations use this saved choice. A
                one-off <code className='type-meta font-mono'>?model=</code>{' '}
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
          <p className='type-meta text-muted-foreground'>
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
          {groundedPicks && <GroundedModelPicks picks={groundedPicks} />}
        </div>
      );
    }
    default: {
      const _never: never = userTier;
      throw new Error(`Unhandled subscription tier: ${String(_never)}`);
    }
  }
}

/** Pro picks for grounded generation; shown only while its flag covers Pro. */
function GroundedModelPicks({ picks }: { picks: SavedGroundedModelPicks }) {
  return (
    <section aria-labelledby='grounded-model-picks' className='space-y-6'>
      <div className='space-y-2'>
        <h3 id='grounded-model-picks' className='type-label'>
          Grounded generation models
        </h3>
        <p className='type-meta text-muted-foreground'>
          Grounded plans research sources first, then write and check the plan.
          Default uses the model Atlaris picks for each step.
        </p>
      </div>
      {GROUNDED_PICK_ROLES.map((role) => {
        const defaultModel = getGroundedPickDefault('pro', role);
        const options: GroundedModelOption[] = getGroundedPickCatalog(role).map(
          (id) => ({ id, label: groundedModelLabel(id) }),
        );
        return (
          <GroundedModelPicker
            key={role}
            preferenceField={GROUNDED_PICK_FIELD_BY_ROLE[role]}
            label={GROUNDED_PICK_COPY[role].label}
            description={GROUNDED_PICK_COPY[role].description}
            defaultLabel={
              defaultModel ? groundedModelLabel(defaultModel) : 'none'
            }
            options={options}
            currentModel={resolveGroundedModelPick('pro', picks, role)}
          />
        );
      })}
    </section>
  );
}
