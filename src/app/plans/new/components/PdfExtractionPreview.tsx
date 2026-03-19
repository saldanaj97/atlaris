'use client';

import type { JSX } from 'react';
import { useId } from 'react';
import { PdfExtractionHeader } from '@/app/plans/new/components/PdfExtractionHeader';
import { PdfMainTopicEditor } from '@/app/plans/new/components/PdfMainTopicEditor';
import { PdfPlanSettingsEditor } from '@/app/plans/new/components/PdfPlanSettingsEditor';
import { PdfPreviewActions } from '@/app/plans/new/components/PdfPreviewActions';
import { PdfSectionsEditor } from '@/app/plans/new/components/PdfSectionsEditor';
import {
  type PdfPlanSettings,
  stripSectionIds,
  usePdfExtractionDraft,
} from '@/app/plans/new/components/usePdfExtractionDraft';
import { Card } from '@/components/ui/card';
import type { ExtractedSection } from '@/features/pdf/types';

export type { PdfPlanSettings } from '@/app/plans/new/components/usePdfExtractionDraft';

interface PdfExtractionPreviewProps {
  mainTopic: string;
  sections: ExtractedSection[];
  pageCount: number;
  confidence: 'high' | 'medium' | 'low';
  onGenerate: (editedData: {
    mainTopic: string;
    sections: ExtractedSection[];
    settings: PdfPlanSettings;
  }) => void;
  onSwitchToManual?: (mainTopic: string) => void;
  isGenerating?: boolean;
}

export function PdfExtractionPreview({
  mainTopic: initialTopic,
  sections: initialSections,
  pageCount,
  confidence,
  onGenerate,
  onSwitchToManual,
  isGenerating = false,
}: PdfExtractionPreviewProps): JSX.Element {
  const sectionSeed = useId();
  const mainTopicId = useId();
  const sectionsLabelId = useId();
  const baseId = useId();

  const {
    draft,
    canGenerate,
    onMainTopicChange,
    onSectionFieldChange,
    onSettingChange,
  } = usePdfExtractionDraft({
    initialTopic,
    initialSections,
    sectionSeed,
  });

  const handleGenerate = () => {
    onGenerate({
      mainTopic: draft.mainTopic,
      sections: stripSectionIds(draft.sections),
      settings: draft.settings,
    });
  };

  return (
    <div className="w-full max-w-3xl space-y-6">
      <Card className="border-border bg-card/60 relative rounded-3xl px-6 py-6 shadow-2xl backdrop-blur-xl">
        <div
          className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl"
          aria-hidden="true"
        >
          <div className="dark:from-primary/40 dark:to-accent/30 from-primary/30 to-accent/20 absolute -top-12 -right-12 h-32 w-32 rounded-full bg-linear-to-br opacity-40 blur-2xl dark:opacity-20" />
        </div>

        <div className="relative">
          <PdfExtractionHeader
            pageCount={pageCount}
            sectionCount={draft.sections.length}
            confidence={confidence}
          />

          <div className="space-y-4">
            <PdfMainTopicEditor
              id={mainTopicId}
              value={draft.mainTopic}
              onChange={onMainTopicChange}
              disabled={isGenerating}
            />

            <PdfSectionsEditor
              sectionsLabelId={sectionsLabelId}
              sections={draft.sections}
              disabled={isGenerating}
              onSectionFieldChange={onSectionFieldChange}
            />

            <PdfPlanSettingsEditor
              baseId={baseId}
              settings={draft.settings}
              onSettingChange={onSettingChange}
            />
          </div>

          <PdfPreviewActions
            mainTopic={draft.mainTopic}
            isGenerating={isGenerating}
            canGenerate={canGenerate}
            onGenerate={handleGenerate}
            onSwitchToManual={onSwitchToManual}
          />
        </div>
      </Card>
    </div>
  );
}
