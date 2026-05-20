import { useEffect, useRef, useState } from 'react';
import { clientLogger } from '@/lib/logging/client';

type ModelPreferenceSaveState = 'idle' | 'success' | 'error';

function normalizePreference(model: string | null): string {
  return model ?? '';
}

export function useModelPreferenceSave({
  currentModel,
  onSave,
}: {
  currentModel: string | null;
  onSave: (modelId: string | null) => Promise<void>;
}) {
  const [selectedModel, setSelectedModel] = useState<string>(() =>
    normalizePreference(currentModel),
  );
  const [optimisticBaseline, setOptimisticBaseline] = useState<
    string | undefined
  >(undefined);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] =
    useState<ModelPreferenceSaveState>('idle');

  const statusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearStatusReset = () => {
    if (statusTimeoutRef.current !== null) {
      clearTimeout(statusTimeoutRef.current);
      statusTimeoutRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      if (statusTimeoutRef.current !== null) {
        clearTimeout(statusTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setSelectedModel(normalizePreference(currentModel));
  }, [currentModel]);

  useEffect(() => {
    setOptimisticBaseline((prev) => {
      if (prev === undefined) return undefined;
      return normalizePreference(currentModel) === prev ? undefined : prev;
    });
  }, [currentModel]);

  const effectiveBaseline =
    optimisticBaseline !== undefined
      ? optimisticBaseline
      : normalizePreference(currentModel);

  const hasChanges = selectedModel !== effectiveBaseline;

  const scheduleStatusReset = () => {
    clearStatusReset();
    statusTimeoutRef.current = setTimeout(() => {
      statusTimeoutRef.current = null;
      setSaveStatus('idle');
    }, 3000);
  };

  const runSave = async (
    modelId: string | null,
    options: {
      errorMessage: string;
      nextSelectedModel?: string;
    },
  ): Promise<void> => {
    setIsSaving(true);
    setSaveStatus('idle');
    clearStatusReset();

    try {
      await onSave(modelId);
      const normalizedModelId = normalizePreference(modelId);

      setOptimisticBaseline(normalizedModelId);
      if (options.nextSelectedModel !== undefined) {
        setSelectedModel(options.nextSelectedModel);
      }
      setSaveStatus('success');
      scheduleStatusReset();
    } catch (error) {
      clientLogger.error(options.errorMessage, {
        message: error instanceof Error ? error.message : String(error),
        selectedModel: modelId,
      });
      setSaveStatus('error');
      scheduleStatusReset();
    } finally {
      setIsSaving(false);
    }
  };

  const saveSelectedModel = async (): Promise<void> => {
    await runSave(selectedModel, {
      errorMessage: 'Failed to save model preference',
    });
  };

  const useTierDefault = async (): Promise<void> => {
    await runSave(null, {
      errorMessage: 'Failed to clear model preference',
      nextSelectedModel: '',
    });
  };

  const clearSelection = () => {
    setSelectedModel('');
  };

  return {
    clearSelection,
    effectiveBaseline,
    hasChanges,
    isSaving,
    saveSelectedModel,
    saveStatus,
    selectedModel,
    setSelectedModel,
    useTierDefault,
  };
}
