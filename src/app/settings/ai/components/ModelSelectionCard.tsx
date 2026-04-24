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
import { ROUTES } from '@/features/navigation/routes';
import { requestBoundary } from '@/lib/api/request-boundary';
import { logger } from '@/lib/logging/logger';
import type { SubscriptionTier } from '@/shared/types/billing.types';

/**
 * Async component that fetches user subscription data and renders the model selector.
 * Wrapped in Suspense boundary by the parent page.
 */
export async function ModelSelectionCard(): Promise<JSX.Element> {
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
		<Card>
			<CardHeader>
				<CardTitle>Model Selection</CardTitle>
				<CardDescription>
					{currentModel !== null ? (
						<>
							Your saved choice is used for new plan generations. You can still
							use a one-off <code className="font-mono text-xs">?model=</code>{' '}
							query on a generation request to override it for that run only.
						</>
					) : (
						<>
							No explicit preference saved yet. New plans use{' '}
							<strong>{tierDefaultLabel}</strong>. Save a model below to store a
							preference. Only persistable models are listed here; the runtime
							router fallback is not.
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
