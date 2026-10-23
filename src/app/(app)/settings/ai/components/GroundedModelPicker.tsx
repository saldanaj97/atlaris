'use client';

import type { PreferenceField } from '@/app/(app)/settings/ai/components/save-model-preference';

import { saveModelPreference } from '@/app/(app)/settings/ai/components/save-model-preference';
import { useModelPreferenceSave } from '@/app/(app)/settings/ai/components/useModelPreferenceSave';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useRouter } from 'next/navigation';
import { useId } from 'react';

/** Keeps the Radix Select controlled while nothing is picked. */
const DEFAULT_VALUE = '__grounded_default__';

export type GroundedModelOption = { id: string; label: string };

type GroundedModelPickerProps = {
  preferenceField: PreferenceField;
  label: string;
  description: string;
  defaultLabel: string;
  options: GroundedModelOption[];
  currentModel: string | null;
};

/**
 * One grounded role pick. "Default" saves `null`, so the role follows the
 * code-owned models.
 */
export function GroundedModelPicker({
  preferenceField,
  label,
  description,
  defaultLabel,
  options,
  currentModel,
}: GroundedModelPickerProps) {
  const router = useRouter();
  const id = useId();
  const triggerId = `${id}-trigger`;
  const helpId = `${id}-help`;
  const {
    hasChanges,
    isSaving,
    restoreTierDefault,
    saveSelectedModel,
    saveStatus,
    selectedModel,
    setSelectedModel,
  } = useModelPreferenceSave({
    currentModel,
    onSave: async (modelId) => {
      await saveModelPreference(preferenceField, modelId);
      router.refresh();
    },
  });

  const handleSave = () => {
    if (selectedModel === '') {
      void restoreTierDefault();
    } else {
      void saveSelectedModel();
    }
  };

  return (
    <div className='space-y-4'>
      <div className='space-y-2'>
        <Label htmlFor={triggerId}>{label}</Label>
        <Select
          value={selectedModel === '' ? DEFAULT_VALUE : selectedModel}
          onValueChange={(v) => setSelectedModel(v === DEFAULT_VALUE ? '' : v)}
          disabled={isSaving}
        >
          <SelectTrigger
            id={triggerId}
            className='w-full text-left'
            aria-describedby={helpId}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent
            align='start'
            className='min-w-(--radix-select-trigger-width)'
          >
            <SelectItem value={DEFAULT_VALUE}>
              Default ({defaultLabel})
            </SelectItem>
            {options.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p id={helpId} className='type-body text-muted-foreground'>
          {description}
        </p>
      </div>

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

      <Button
        type='button'
        onClick={handleSave}
        disabled={!hasChanges || isSaving}
        className='w-full'
      >
        {isSaving ? 'Saving…' : `Save ${label.toLowerCase()}`}
      </Button>
    </div>
  );
}
