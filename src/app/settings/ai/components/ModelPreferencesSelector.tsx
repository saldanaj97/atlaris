'use client';

import { useRouter } from 'next/navigation';
import type { JSX } from 'react';
import { ModelSelector } from '@/app/settings/ai/components/model-selector';
import type {
  AvailableModel,
  SubscriptionTier,
} from '@/features/ai/types/model.types';
import { parseApiErrorResponse } from '@/lib/api/error-response';
import { clientLogger } from '@/lib/logging/client';

type ModelPreferencesSelectorProps = {
  currentModel: string | null;
  userTier: SubscriptionTier;
  availableModels: AvailableModel[];
};

/**
 * Client bridge: persists preferred model via PATCH and refreshes server props.
 */
export function ModelPreferencesSelector({
  currentModel,
  userTier,
  availableModels,
}: ModelPreferencesSelectorProps): JSX.Element {
  const router = useRouter();

  async function handleSave(modelId: string | null): Promise<void> {
    let res: Response;
    try {
      res = await fetch('/api/v1/user/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferredAiModel: modelId }),
      });
    } catch (error) {
      clientLogger.error('Network error saving user preferences', {
        operation: 'savePreferences',
        modelId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    if (!res.ok) {
      const fallbackMessage = 'Failed to save preferences';
      let errorMessage = fallbackMessage;
      let errorCode: string | undefined;

      try {
        const parsed = await parseApiErrorResponse(res, fallbackMessage);
        errorMessage = parsed.error;
        errorCode = parsed.code;
      } catch (error) {
        clientLogger.error('Failed to parse preference update API error', {
          operation: 'savePreferences',
          modelId,
          status: res.status,
          statusText: res.statusText,
          error: error instanceof Error ? error.message : String(error),
        });
      }

      clientLogger.error('API rejected preference update', {
        operation: 'savePreferences',
        modelId,
        status: res.status,
        statusText: res.statusText,
        code: errorCode,
        error: errorMessage,
      });
      throw new Error(errorMessage);
    }

    router.refresh();
  }

  return (
    <ModelSelector
      currentModel={currentModel}
      userTier={userTier}
      availableModels={availableModels}
      onSave={handleSave}
    />
  );
}
