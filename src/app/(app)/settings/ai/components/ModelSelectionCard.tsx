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
import { getDefaultModelForTier } from '@/features/ai/ai-models';
import { isGroundedEnabled } from '@/features/ai/grounded-generation-flag';
import {
  getMemoizedCatalogModel,
  getTierModels,
} from '@/features/ai/model-catalog/catalog';
import {
  GROUNDED_MODEL_PICKS_FEATURE,
  GROUNDED_PICK_FIELD_BY_ROLE,
  GROUNDED_PICK_ROLES,
  getGroundedPickCatalog,
  getGroundedPickDefault,
  getPersistableModelsForTier,
  getProOnlyModelsForTier,
  resolveGroundedModelPick,
  resolveSavedPreferenceForSettings,
} from '@/features/ai/model-preferences';
import { ROUTES } from '@/features/navigation/routes';
import { requestBoundary } from '@/lib/api/request-boundary';
import { hasClerkPlanFeature } from '@/lib/auth/server';
import { getGroundedModelPreferences } from '@/lib/db/queries/user-preferences';
import { logger } from '@/lib/logging/logger';
import { AlertCircle } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';

const GROUNDED_PICK_COPY = {
  writer: {
    label: 'Writer model',
    description:
      'Writes grounded outlines, regenerations, and lessons, and fixes lessons that fail checks.',
  },
  verifier: {
    label: 'Lesson checker',
    description: 'Checks each lesson against its sources.',
  },
  advisor: {
    label: 'Advisor model',
    description: 'Suggests fixes when a check finds problems.',
  },
} as const satisfies Record<
  GroundedPickRole,
  { label: string; description: string }
>;

/**
 * Grounded pickers need Pro, the grounded flag on for Pro, and the Clerk plan
 * feature. An unavailable Clerk check is logged and hides the pickers.
 */
async function canShowGroundedPicks(actor: {
  authUserId: string;
  subscriptionTier: SubscriptionTier;
}): Promise<boolean> {
  if (actor.subscriptionTier !== 'pro' || !(await isGroundedEnabled('pro'))) {
    return false;
  }
  try {
    return await hasClerkPlanFeature(
      actor.authUserId,
      GROUNDED_MODEL_PICKS_FEATURE,
    );
  } catch (error) {
    logger.error(
      { error },
      'Clerk feature check failed; hiding grounded model pickers',
    );
    return false;
  }
}

/**
 * Display names for every grounded pick option and default, from Pro's synced
 * models in one read; an id the guardrail doesn't list, or every id when the
 * catalog can't be read, shows as itself.
 */
async function loadGroundedModelNames(): Promise<Map<string, string>> {
  const ids = new Set(
    GROUNDED_PICK_ROLES.flatMap((role) => {
      const defaultModel = getGroundedPickDefault('pro', role);
      return [
        ...getGroundedPickCatalog(role),
        ...(defaultModel ? [defaultModel] : []),
      ];
    }),
  );
  let names = new Map<string, string>();
  try {
    names = new Map(
      (await getTierModels('pro')).map((model) => [model.id, model.name]),
    );
  } catch (error) {
    logger.warn(
      { error },
      'Model catalog read failed; grounded pickers show model ids',
    );
  }
  return new Map([...ids].map((id) => [id, names.get(id) ?? id]));
}

/**
 * Async component that fetches user subscription data and renders the model selector.
 */
export async function ModelSelectionCard() {
  const result = await requestBoundary.component(async ({ actor, db }) => ({
    user: actor,
    groundedPicks: (await canShowGroundedPicks(actor))
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
      const [availableModels, proOnlyModels, currentModel, tierDefaultId] =
        await Promise.all([
          getPersistableModelsForTier(userTier, 'initial_outline'),
          getProOnlyModelsForTier(userTier, 'initial_outline'),
          resolveSavedPreferenceForSettings(
            userTier,
            user.preferredAiModel,
            'initial_outline',
          ),
          getDefaultModelForTier(userTier, 'initial_outline'),
        ]);
      // The default can be outside the persistable list (the free router
      // when the guardrail left no paid default), so fall back to the catalog.
      const tierDefaultMeta =
        availableModels.find((model) => model.id === tierDefaultId) ??
        (await getMemoizedCatalogModel(tierDefaultId));
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
                a preference. Only models your plan can save are selectable.
              </>
            )}
          </p>
          <ModelPreferencesSelector
            currentModel={currentModel}
            userTier={userTier}
            availableModels={availableModels}
            proOnlyModels={proOnlyModels}
          />
        </div>
      );
    }
    case 'pro': {
      const [
        outlineModels,
        regenerationModels,
        lessonModels,
        outlineModel,
        regenerationModel,
        lessonModel,
        groundedModelNames,
      ] = await Promise.all([
        getPersistableModelsForTier(userTier, 'initial_outline'),
        getPersistableModelsForTier(userTier, 'regeneration'),
        getPersistableModelsForTier(userTier, 'lesson'),
        resolveSavedPreferenceForSettings(
          userTier,
          user.preferredAiModel,
          'initial_outline',
        ),
        resolveSavedPreferenceForSettings(
          userTier,
          user.preferredRegenerationAiModel,
          'regeneration',
        ),
        resolveSavedPreferenceForSettings(
          userTier,
          user.preferredLessonAiModel,
          'lesson',
        ),
        groundedPicks ? loadGroundedModelNames() : null,
      ]);

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
          {groundedPicks && groundedModelNames && (
            <GroundedModelPicks
              picks={groundedPicks}
              modelNames={groundedModelNames}
            />
          )}
        </div>
      );
    }
    default: {
      const _never: never = userTier;
      throw new Error(`Unhandled subscription tier: ${String(_never)}`);
    }
  }
}

/** Pro picks for grounded generation; shown only when `canShowGroundedPicks`. */
function GroundedModelPicks({
  picks,
  modelNames,
}: {
  picks: SavedGroundedModelPicks;
  /** Display names from the synced guardrail models. */
  modelNames: ReadonlyMap<string, string>;
}) {
  const groundedModelLabel = (modelId: string) =>
    modelNames.get(modelId) ?? modelId;
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
