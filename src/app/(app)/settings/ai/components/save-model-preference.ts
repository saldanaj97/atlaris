import { parseApiErrorResponse } from '@/lib/api/error-response';
import { clientLogger } from '@/lib/logging/client';

export type PreferenceField =
  | 'preferredAiModel'
  | 'preferredRegenerationAiModel'
  | 'preferredLessonAiModel'
  | 'preferredWriterAiModel'
  | 'preferredVerifierAiModel'
  | 'preferredAdvisorAiModel';

/** PATCHes one model slot; throws with the API's message when rejected. */
export async function saveModelPreference(
  preferenceField: PreferenceField,
  modelId: string | null,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch('/api/v1/user/preferences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [preferenceField]: modelId }),
    });
  } catch (error) {
    clientLogger.error('Network error saving user preferences', {
      operation: 'savePreferences',
      modelId,
      preferenceField,
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
        preferenceField,
        status: res.status,
        statusText: res.statusText,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    clientLogger.error('API rejected preference update', {
      operation: 'savePreferences',
      modelId,
      preferenceField,
      status: res.status,
      statusText: res.statusText,
      code: errorCode,
      error: errorMessage,
    });
    throw new Error(errorMessage);
  }
}
