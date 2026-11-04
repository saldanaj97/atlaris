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
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ROUTES } from '@/features/navigation/routes';
import { AlertCircle, Lock } from 'lucide-react';
import Link from 'next/link';
import { useId } from 'react';

type ModelSelectorProps = {
  currentModel: string | null;
  userTier: SubscriptionTier;
  availableModels: AvailableModel[];
  /** Models shown disabled with a Pro plan badge; never selectable. */
  proOnlyModels?: AvailableModel[];
  onSave: (modelId: string | null) => Promise<void>;
  label?: string;
  showUpgradeCta?: boolean;
};

const ModelDropdown = ({
  availableModels,
  proOnlyModels = [],
  userTier,
  currentModel,
  onSave,
  label = 'Preferred AI Model',
  showUpgradeCta = true,
}: ModelSelectorProps) => {
  const modelSelectId = useId();
  const triggerId = `${modelSelectId}-trigger`;
  const proOnlyHintId = `${modelSelectId}-pro-only-hint`;
  const hasProOnlyModels = proOnlyModels.length > 0;
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
        <Label htmlFor={triggerId}>{label}</Label>
        {/* Radix Select stays controlled with `value=''` and shows the placeholder. */}
        <Select value={selectedModel} onValueChange={setSelectedModel}>
          <SelectTrigger
            id={triggerId}
            className='w-full'
            aria-describedby={hasProOnlyModels ? proOnlyHintId : undefined}
          >
            <SelectValue placeholder='Select a model' />
          </SelectTrigger>
          <SelectContent
            align='start'
            className='min-w-(--radix-select-trigger-width)'
          >
            {availableModels.map((model) => (
              <SelectItem key={model.id} value={model.id}>
                <div className='flex items-center gap-2'>
                  <span>{model.name}</span>
                  {/* Secondary matches the popover and card matches the trigger, so swap only in the list. */}
                  <Badge
                    variant={model.tier === 'free' ? 'default' : 'secondary'}
                    className={
                      model.tier === 'free'
                        ? undefined
                        : 'in-data-[slot=select-content]:bg-card'
                    }
                  >
                    {model.tier === 'free' ? 'Free' : 'Paid'}
                  </Badge>
                </div>
              </SelectItem>
            ))}
            {hasProOnlyModels && (
              <SelectGroup>
                <SelectSeparator />
                {/* The open list can cover the hint below the trigger, so repeat it here. */}
                <SelectLabel>Upgrade to Pro to use these models</SelectLabel>
                {proOnlyModels.map((model) => (
                  <SelectItem key={model.id} value={model.id} disabled>
                    <div className='flex items-center gap-2'>
                      <span>{model.name}</span>
                      <Badge
                        variant='outline'
                        className='border-disabled-border text-disabled-foreground'
                      >
                        <Lock aria-hidden='true' className='size-3' />
                        Pro plan
                      </Badge>
                    </div>
                  </SelectItem>
                ))}
              </SelectGroup>
            )}
          </SelectContent>
        </Select>
        {hasProOnlyModels && (
          <p id={proOnlyHintId} className='type-body text-muted-foreground'>
            Models marked Pro plan are available when you upgrade to Pro.
          </p>
        )}
      </div>

      {selectedModelData && (
        <Card className='rounded-xl p-4'>
          <div className='space-y-3'>
            <div className='flex items-start justify-between'>
              <div>
                <h3 className='font-semibold'>{selectedModelData.name}</h3>
                <p className='type-body text-muted-foreground'>
                  by {selectedModelData.provider}
                </p>
              </div>
              <Badge
                variant={
                  selectedModelData.tier === 'free' ? 'default' : 'secondary'
                }
              >
                {selectedModelData.tier === 'free' ? 'Free' : 'Paid'}
              </Badge>
            </div>

            <p className='type-body'>{selectedModelData.description}</p>

            <dl className='grid grid-cols-4 gap-4 pt-2'>
              <div>
                <dt className='type-meta text-muted-foreground'>
                  Context window
                </dt>
                <dd className='type-label tabular-nums'>
                  {(selectedModelData.contextWindow / 1000).toFixed(0)}K tokens
                </dd>
              </div>
              <div>
                <dt className='type-meta text-muted-foreground'>Max output</dt>
                <dd className='type-label tabular-nums'>
                  {selectedModelData.maxOutputTokens == null
                    ? '—'
                    : `${(selectedModelData.maxOutputTokens / 1000).toFixed(0)}K tokens`}
                </dd>
              </div>
              <div>
                <dt className='type-meta text-muted-foreground'>Input cost</dt>
                <dd className='type-label tabular-nums'>
                  {selectedModelData.inputCostPerMillion === 0
                    ? 'Free'
                    : `$${selectedModelData.inputCostPerMillion}/M`}
                </dd>
              </div>
              <div>
                <dt className='type-meta text-muted-foreground'>Output cost</dt>
                <dd className='type-label tabular-nums'>
                  {selectedModelData.outputCostPerMillion === 0
                    ? 'Free'
                    : `$${selectedModelData.outputCostPerMillion}/M`}
                </dd>
              </div>
            </dl>
          </div>
        </Card>
      )}

      {saveStatus === 'error' && (
        <p
          aria-live='assertive'
          className='rounded-lg border-2 border-destructive bg-destructive/10 p-3 type-body text-destructive'
        >
          Failed to save preferences. Please try again.
        </p>
      )}

      {saveStatus === 'success' && (
        <output
          aria-live='polite'
          className='rounded-lg border-2 border-success bg-success/10 p-3 type-body text-success dark:text-success-foreground'
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
        {isSaving ? 'Saving…' : 'Save preferences'}
      </Button>

      {showUpgradeCta && userTier !== 'pro' && (
        <div className='rounded-lg border-2 border-border bg-muted p-4'>
          <h4 className='mb-2 font-semibold'>Unlock premium models</h4>
          <p className='mb-3 type-body text-muted-foreground'>
            Upgrade to Pro to access advanced models like Claude Sonnet 5.5,
            GPT-6.1 Sol, and Claude Opus 5.5.
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
  proOnlyModels,
  onSave,
  label,
  showUpgradeCta,
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
      proOnlyModels={proOnlyModels}
      userTier={userTier}
      currentModel={currentModel}
      onSave={onSave}
      label={label}
      showUpgradeCta={showUpgradeCta}
    />
  );
}
