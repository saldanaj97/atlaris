'use client';

import { AlertCircle } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type {
  AvailableModel,
  SubscriptionTier,
} from '@/features/ai/types/model.types';
import { ROUTES } from '@/features/navigation';
import { clientLogger } from '@/lib/logging/client';

/** Placeholder value so Radix Select stays controlled (never uncontrolled↔controlled). */
const NO_MODEL_VALUE = '__no_model_selected__';

function normalizePreference(model: string | null): string {
  return model ?? '';
}

interface ModelSelectorProps {
  currentModel: string | null;
  userTier: SubscriptionTier;
  availableModels: AvailableModel[];
  onSave: (modelId: string | null) => Promise<void>;
}

interface ModelDropdownProps {
  availableModels: AvailableModel[];
  userTier: SubscriptionTier;
  currentModel: string | null;
  onSave: (modelId: string | null) => Promise<void>;
}

const ModelDropdown = ({
  availableModels,
  userTier,
  currentModel,
  onSave,
}: ModelDropdownProps) => {
  const [selectedModel, setSelectedModel] = useState<string>(() =>
    normalizePreference(currentModel)
  );
  const [optimisticBaseline, setOptimisticBaseline] = useState<
    string | undefined
  >(undefined);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>(
    'idle'
  );

  const statusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (statusTimeoutRef.current) {
        clearTimeout(statusTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setSelectedModel(normalizePreference(currentModel));
  }, [currentModel]);

  // After save we set optimisticBaseline to the value we sent; when `currentModel`
  // (server) catches up, setOptimisticBaseline compares normalizePreference(currentModel)
  // to that baseline and clears optimisticBaseline. Until then, effectiveBaseline uses
  // optimisticBaseline when set, otherwise normalizePreference(currentModel).
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

  const selectedModelData = availableModels.find((m) => m.id === selectedModel);

  const hasChanges = selectedModel !== effectiveBaseline;

  const scheduleStatusReset = () => {
    if (statusTimeoutRef.current) {
      clearTimeout(statusTimeoutRef.current);
    }
    statusTimeoutRef.current = setTimeout(() => setSaveStatus('idle'), 3000);
  };

  const handleSave = async () => {
    if (selectedModel === '') return;

    setIsSaving(true);
    setSaveStatus('idle');

    if (statusTimeoutRef.current) {
      clearTimeout(statusTimeoutRef.current);
    }

    try {
      await onSave(selectedModel);
      setOptimisticBaseline(selectedModel);
      setSaveStatus('success');
      scheduleStatusReset();
    } catch (error) {
      clientLogger.error('Failed to save model preference:', {
        message: error instanceof Error ? error.message : String(error),
        selectedModel,
      });
      setSaveStatus('error');
      scheduleStatusReset();
    } finally {
      setIsSaving(false);
    }
  };

  const handleUseTierDefault = async () => {
    setIsSaving(true);
    setSaveStatus('idle');
    if (statusTimeoutRef.current) {
      clearTimeout(statusTimeoutRef.current);
    }
    try {
      await onSave(null);
      setOptimisticBaseline('');
      setSelectedModel('');
      setSaveStatus('success');
      scheduleStatusReset();
    } catch (error) {
      clientLogger.error('Failed to clear model preference:', {
        message: error instanceof Error ? error.message : String(error),
      });
      setSaveStatus('error');
      scheduleStatusReset();
    } finally {
      setIsSaving(false);
    }
  };

  const handleClearSelection = () => {
    if (selectedModel !== '') {
      setSelectedModel('');
    }
  };

  const handleSecondaryAction = () => {
    if (effectiveBaseline !== '') {
      void handleUseTierDefault();
    } else {
      handleClearSelection();
    }
  };

  const showSecondaryAction = effectiveBaseline !== '' || selectedModel !== '';

  const saveDisabled =
    !hasChanges || isSaving || selectedModel === '' || !selectedModelData;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="model-select">Preferred AI Model</Label>
        <Select
          value={selectedModel === '' ? NO_MODEL_VALUE : selectedModel}
          onValueChange={(v) => setSelectedModel(v === NO_MODEL_VALUE ? '' : v)}
        >
          <SelectTrigger id="model-select" className="w-full">
            <SelectValue placeholder="Select a model" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_MODEL_VALUE}>
              <span className="text-muted-foreground">Select a model</span>
            </SelectItem>
            {availableModels.map((model) => (
              <SelectItem key={model.id} value={model.id}>
                <div className="flex items-center gap-2">
                  <span>{model.name}</span>
                  <Badge
                    variant={model.tier === 'free' ? 'default' : 'secondary'}
                  >
                    {model.tier.toUpperCase()}
                  </Badge>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selectedModelData && (
        <Card className="p-4">
          <div className="space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold">{selectedModelData.name}</h3>
                <p className="text-muted-foreground text-sm">
                  by {selectedModelData.provider}
                </p>
              </div>
              <Badge
                variant={
                  selectedModelData.tier === 'free' ? 'default' : 'secondary'
                }
              >
                {selectedModelData.tier.toUpperCase()}
              </Badge>
            </div>

            <p className="text-sm">{selectedModelData.description}</p>

            <div className="grid grid-cols-4 gap-4 pt-2">
              <div>
                <p className="text-muted-foreground text-xs">Context Window</p>
                <p className="text-sm font-medium">
                  {(selectedModelData.contextWindow / 1000).toFixed(0)}K tokens
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Max Output</p>
                <p className="text-sm font-medium">
                  {(
                    (selectedModelData.maxOutputTokens ??
                      selectedModelData.contextWindow / 2) / 1000
                  ).toFixed(0)}
                  K tokens
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Input Cost</p>
                <p className="text-sm font-medium">
                  {selectedModelData.inputCostPerMillion === 0
                    ? 'Free'
                    : `$${selectedModelData.inputCostPerMillion}/M`}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Output Cost</p>
                <p className="text-sm font-medium">
                  {selectedModelData.outputCostPerMillion === 0
                    ? 'Free'
                    : `$${selectedModelData.outputCostPerMillion}/M`}
                </p>
              </div>
            </div>
          </div>
        </Card>
      )}

      {saveStatus === 'error' && (
        <div
          role="alert"
          className="border-destructive bg-destructive/10 text-destructive rounded-lg border-2 p-3 text-sm"
        >
          Failed to save preferences. Please try again.
        </div>
      )}

      {saveStatus === 'success' && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-lg border-2 border-green-500 bg-green-500/10 p-3 text-sm text-green-700 dark:text-green-400"
        >
          Preferences saved successfully!
        </div>
      )}

      {showSecondaryAction && (
        <Button
          type="button"
          variant="outline"
          className="w-full"
          disabled={isSaving}
          onClick={handleSecondaryAction}
        >
          {effectiveBaseline !== '' ? 'Use tier default' : 'Clear selection'}
        </Button>
      )}

      <Button
        type="button"
        onClick={() => void handleSave()}
        disabled={saveDisabled}
        className="w-full"
      >
        {isSaving ? 'Saving...' : 'Save Preferences'}
      </Button>

      {userTier !== 'pro' && (
        <div className="border-border bg-muted rounded-lg border-2 p-4">
          <h4 className="mb-2 font-semibold">Unlock Premium Models</h4>
          <p className="text-muted-foreground mb-3 text-sm">
            Upgrade to Pro to access advanced models like Claude Sonnet 4.5,
            GPT-5.2, and more with larger context windows and better
            performance.
          </p>
          <Button variant="default" className="w-full" asChild>
            <Link href={ROUTES.PRICING}>Upgrade to Pro</Link>
          </Button>
        </div>
      )}
    </div>
  );
};

export function ModelSelector({
  userTier,
  currentModel = null,
  availableModels,
  onSave,
}: ModelSelectorProps) {
  if (availableModels.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <AlertCircle className="size-6" aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>No models available</EmptyTitle>
          <EmptyDescription>
            No AI models are currently available for your subscription tier.
            This may occur if model configurations are being updated or if your
            tier doesn&apos;t have access to any models.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button asChild variant="default">
            <Link href={ROUTES.PRICING}>View Pricing Plans</Link>
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  return (
    <ModelDropdown
      availableModels={availableModels}
      userTier={userTier}
      currentModel={currentModel}
      onSave={onSave}
    />
  );
}
