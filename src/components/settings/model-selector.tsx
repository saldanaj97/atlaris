'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AVAILABLE_MODELS } from '@/lib/ai/ai-models';
import type { SubscriptionTier } from '@/lib/ai/types';
import { logger } from '@/lib/logging/logger';
import { cn } from '@/lib/utils';
import { useEffect, useRef, useState } from 'react';

interface ModelSelectorProps {
  currentModel: string | null;
  userTier: SubscriptionTier;
  onSave?: (modelId: string) => Promise<void>;
}

export function ModelSelector({
  currentModel,
  userTier,
  onSave,
}: ModelSelectorProps) {
  const [selectedModel, setSelectedModel] = useState<string>(
    currentModel ?? AVAILABLE_MODELS[0]?.id ?? ''
  );
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<
    'idle' | 'success' | 'error' | 'upgradeRequired'
  >('idle');

  // Filter models by user's tier
  const availableModels =
    userTier === 'pro'
      ? AVAILABLE_MODELS
      : AVAILABLE_MODELS.filter((m) => m.tier === 'free');

  const selectedModelData = AVAILABLE_MODELS.find(
    (m) => m.id === selectedModel
  );

  // Ref to track timeout for cleanup
  const statusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (statusTimeoutRef.current) {
        clearTimeout(statusTimeoutRef.current);
      }
    };
  }, []);

  const handleSave = async () => {
    if (!selectedModelData) return;

    // Check tier-gating
    if (selectedModelData.tier === 'pro' && userTier !== 'pro') {
      setSaveStatus('upgradeRequired');
      return;
    }

    setIsSaving(true);
    setSaveStatus('idle');

    // Clear any existing timeout
    if (statusTimeoutRef.current) {
      clearTimeout(statusTimeoutRef.current);
    }

    try {
      if (onSave) {
        await onSave(selectedModel);
      }
      setSaveStatus('success');
      statusTimeoutRef.current = setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (error) {
      logger.error({ error, selectedModel }, 'Failed to save model preference');
      setSaveStatus('error');
      statusTimeoutRef.current = setTimeout(() => setSaveStatus('idle'), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  const hasChanges = selectedModel !== currentModel;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="model-select">Preferred AI Model</Label>
        <Select value={selectedModel} onValueChange={setSelectedModel}>
          <SelectTrigger id="model-select" className="w-full">
            <SelectValue placeholder="Select a model" />
          </SelectTrigger>
          <SelectContent>
            {availableModels.map((model) => (
              <SelectItem key={model.id} value={model.id}>
                <div className="flex items-center gap-2">
                  <span>{model.name}</span>
                  <Badge
                    variant={model.tier === 'free' ? 'default' : 'neutral'}
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
                  selectedModelData.tier === 'free' ? 'default' : 'neutral'
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
                  {(selectedModelData.contextWindow / 1000 / 2).toFixed(0)}K
                  tokens
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

      {saveStatus === 'upgradeRequired' && (
        <div className="rounded-base border-2 border-red-500 bg-red-50 p-3 text-sm text-red-900">
          This model requires a Pro subscription. Please upgrade to use premium
          models.
        </div>
      )}

      {saveStatus === 'error' && (
        <div className="rounded-base border-2 border-red-500 bg-red-50 p-3 text-sm text-red-900">
          Failed to save preferences. Please try again.
        </div>
      )}

      {saveStatus === 'success' && (
        <div className="rounded-base border-2 border-green-500 bg-green-50 p-3 text-sm text-green-900">
          Preferences saved successfully!
        </div>
      )}

      <Button
        onClick={() => void handleSave()}
        disabled={!hasChanges || isSaving}
        className={cn('w-full', !hasChanges && 'opacity-50')}
      >
        {isSaving ? 'Saving...' : 'Save Preferences'}
      </Button>

      {userTier !== 'pro' && (
        <div className="rounded-base border-border bg-main border-2 p-4">
          <h4 className="mb-2 font-semibold">Unlock Premium Models</h4>
          <p className="text-muted-foreground mb-3 text-sm">
            Upgrade to Pro to access advanced models like Claude Sonnet 4.5,
            GPT-5.2, and more with larger context windows and better
            performance.
          </p>
          <Button variant="default" className="w-full" asChild>
            <a href="/pricing">Upgrade to Pro</a>
          </Button>
        </div>
      )}
    </div>
  );
}
