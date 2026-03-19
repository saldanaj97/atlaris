'use client';

import type { JSX } from 'react';
import { PdfSectionEditorRow } from '@/app/plans/new/components/PdfSectionEditorRow';
import type { SectionWithId } from '@/app/plans/new/components/usePdfExtractionDraft';
import { ScrollArea } from '@/components/ui/scroll-area';

interface PdfSectionsEditorProps {
  sectionsLabelId: string;
  sections: SectionWithId[];
  disabled?: boolean;
  onSectionFieldChange: (
    sectionId: string,
    field: 'title' | 'content',
    value: string
  ) => void;
}

export function PdfSectionsEditor({
  sectionsLabelId,
  sections,
  disabled = false,
  onSectionFieldChange,
}: PdfSectionsEditorProps): JSX.Element {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <span
          id={sectionsLabelId}
          className="text-foreground text-sm font-medium"
        >
          Sections ({sections.length})
        </span>
        <p className="text-muted-foreground text-xs">
          Edit titles and content as needed
        </p>
      </div>

      <ScrollArea className="max-h-64" aria-labelledby={sectionsLabelId}>
        <div className="space-y-3">
          {sections.map((section, index) => (
            <PdfSectionEditorRow
              key={section.id}
              section={section}
              index={index}
              disabled={disabled}
              onTitleChange={(sectionId, value) =>
                onSectionFieldChange(sectionId, 'title', value)
              }
              onContentChange={(sectionId, value) =>
                onSectionFieldChange(sectionId, 'content', value)
              }
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
