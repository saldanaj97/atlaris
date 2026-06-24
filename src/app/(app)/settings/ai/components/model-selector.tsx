'use client';

import type { AvailableModel } from '@/features/ai/types/model.types';
import type { SubscriptionTier } from '@/shared/types/billing.types';

import { useModelPreferenceSave } from '@/app/(app)/settings/ai/components/useModelPreferenceSave';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { RouteEmptyState } from '@/components/ui/route-empty-state';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ROUTES } from '@/features/navigation/routes';
import { AlertCircle } from 'lucide-react';
import Link from 'next/link';
import { useId } from 'react';

/** Placeholder value so Radix Select stays controlled (never uncontrolled↔controlled). */
const NO_MODEL_VALUE = '__no_model_selected__';

type ModelSelectorProps = {
  currentModel: string | null;
  userTier: SubscriptionTier;
  availableModels: AvailableModel[];
  onSave: (modelId: string | null) => Promise<void>;
};

const ModelDropdown = ({
  availableModels,
  userTier,
  currentModel,
  onSave,
}: ModelSelectorProps) => {
  const modelSelectId = useId();
  const triggerId = `${modelSelectId}-trigger`;
  const {
    clearSelection,
    effectiveBaseline,
    hasChanges,
    isSaving,
    restoreTierDefault,
    saveSelectedModel,
    saveStatus,
    selectedModel,
    setSelectedModel,
  } = useModelPreferenceSave({ currentModel, onSave });

  const selectedModelData = availableModels.find((m) => m.id === selectedModel);

  const handleSecondaryAction = () => {
    if (effectiveBaseline !== '') {
      void restoreTierDefault();
    } else {
      clearSelection();
    }
  };

  const showSecondaryAction = effectiveBaseline !== '' || selectedModel !== '';

  const saveDisabled =
    !hasChanges || isSaving || selectedModel === '' || !selectedModelData;

  return (
    <div className='space-y-4'>
      <div className='space-y-2'>
        <Label htmlFor={triggerId}>Preferred AI Model</Label>
        <Select
          value={selectedModel === '' ? NO_MODEL_VALUE : selectedModel}
          onValueChange={(v) => setSelectedModel(v === NO_MODEL_VALUE ? '' : v)}
        >
          <SelectTrigger id={triggerId} className='w-full'>
            <SelectValue placeholder='Select a model' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_MODEL_VALUE}>
              <span className='text-muted-foreground'>Select a model</span>
            </SelectItem>
            {availableModels.map((model) => (
              <SelectItem key={model.id} value={model.id}>
                <div className='flex items-center gap-2'>
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
        <Card className='rounded-xl p-4'>
          <div className='space-y-3'>
            <div className='flex items-start justify-between'>
              <div>
                <h3 className='font-semibold'>{selectedModelData.name}</h3>
                <p className='text-sm text-muted-foreground'>
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

            <p className='text-sm'>{selectedModelData.description}</p>

            <div className='grid grid-cols-4 gap-4 pt-2'>
              <div>
                <p className='text-xs text-muted-foreground'>Context Window</p>
                <p className='text-sm font-medium'>
                  {(selectedModelData.contextWindow / 1000).toFixed(0)}K tokens
                </p>
              </div>
              <div>
                <p className='text-xs text-muted-foreground'>Max Output</p>
                <p className='text-sm font-medium'>
                  {(
                    (selectedModelData.maxOutputTokens ??
                      selectedModelData.contextWindow / 2) / 1000
                  ).toFixed(0)}
                  K tokens
                </p>
              </div>
              <div>
                <p className='text-xs text-muted-foreground'>Input Cost</p>
                <p className='text-sm font-medium'>
                  {selectedModelData.inputCostPerMillion === 0
                    ? 'Free'
                    : `$${selectedModelData.inputCostPerMillion}/M`}
                </p>
              </div>
              <div>
                <p className='text-xs text-muted-foreground'>Output Cost</p>
                <p className='text-sm font-medium'>
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
        <p
          aria-live='assertive'
          className='rounded-lg border-2 border-destructive bg-destructive/10 p-3 text-sm text-destructive'
        >
          Failed to save preferences. Please try again.
        </p>
      )}

      {saveStatus === 'success' && (
        <output
          aria-live='polite'
          className='rounded-lg border-2 border-success bg-success/10 p-3 text-sm text-success dark:text-success-foreground'
        >
          Preferences saved successfully!
        </output>
      )}

      {showSecondaryAction && (
        <Button
          type='button'
          variant='outline'
          className='w-full'
          disabled={isSaving}
          onClick={handleSecondaryAction}
        >
          {effectiveBaseline !== '' ? 'Use tier default' : 'Clear selection'}
        </Button>
      )}

      <Button
        type='button'
        onClick={() => void saveSelectedModel()}
        disabled={saveDisabled}
        className='w-full'
      >
        {isSaving ? 'Saving…' : 'Save Preferences'}
      </Button>

      {userTier !== 'pro' && (
        <div className='rounded-lg border-2 border-border bg-muted p-4'>
          <h4 className='mb-2 font-semibold'>Unlock Premium Models</h4>
          <p className='mb-3 text-sm text-muted-foreground'>
            Upgrade to Pro to access advanced models like Claude Sonnet 4.5,
            GPT-5.2, and more with larger context windows and better
            performance.
          </p>
          <Button variant='default' className='w-full' asChild>
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
      <RouteEmptyState
        icon={AlertCircle}
        title='No models available'
        description="No AI models are currently available for your subscription tier. This may occur if model configurations are being updated or if your tier doesn't have access to any models."
        action={
          <Button asChild variant='default'>
            <Link href={ROUTES.PRICING}>View pricing plans</Link>
          </Button>
        }
      />
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
