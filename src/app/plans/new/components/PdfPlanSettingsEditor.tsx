'use client';

import {
  DEADLINE_OPTIONS,
  LEARNING_STYLE_OPTIONS,
  SKILL_LEVEL_OPTIONS,
  WEEKLY_HOURS_OPTIONS,
} from '@/app/plans/new/components/plan-form/constants';
import { InlineDropdown } from '@/app/plans/new/components/plan-form/InlineDropdown';
import type { PdfPlanSettings } from '@/app/plans/new/components/usePdfExtractionDraft';
import { Calendar, Clock } from 'lucide-react';
import type { JSX } from 'react';

interface PdfPlanSettingsEditorProps {
  baseId: string;
  settings: PdfPlanSettings;
  onSettingChange: (field: keyof PdfPlanSettings, value: string) => void;
}

export function PdfPlanSettingsEditor({
  baseId,
  settings,
  onSettingChange,
}: PdfPlanSettingsEditorProps): JSX.Element {
  return (
    <div className="border-border dark:border-border mt-4 border-t pt-4">
      <p className="text-foreground mb-3 text-sm font-medium">Plan Settings</p>
      <div className="dark:text-foreground text-foreground mb-3 flex flex-wrap items-center gap-2">
        <span className="text-sm">I&apos;m a</span>
        <InlineDropdown
          id={`${baseId}-skill-level`}
          options={SKILL_LEVEL_OPTIONS}
          value={settings.skillLevel}
          onChange={(value) => onSettingChange('skillLevel', value)}
          variant="primary"
        />
        <span className="text-sm">with</span>
        <InlineDropdown
          id={`${baseId}-weekly-hours`}
          options={WEEKLY_HOURS_OPTIONS}
          value={settings.weeklyHours}
          onChange={(value) => onSettingChange('weeklyHours', value)}
          icon={<Clock className="h-3.5 w-3.5" />}
          variant="accent"
        />
        <span className="text-sm">per week.</span>
      </div>

      <div className="dark:text-foreground text-foreground flex flex-wrap items-center gap-2">
        <span className="text-sm">I prefer</span>
        <InlineDropdown
          id={`${baseId}-learning-style`}
          options={LEARNING_STYLE_OPTIONS}
          value={settings.learningStyle}
          onChange={(value) => onSettingChange('learningStyle', value)}
          variant="accent"
        />
        <span className="text-sm">and want to finish in</span>
        <InlineDropdown
          id={`${baseId}-deadline`}
          options={DEADLINE_OPTIONS}
          value={settings.deadlineWeeks}
          onChange={(value) => onSettingChange('deadlineWeeks', value)}
          icon={<Calendar className="h-3.5 w-3.5" />}
          variant="primary"
        />
      </div>
    </div>
  );
}
