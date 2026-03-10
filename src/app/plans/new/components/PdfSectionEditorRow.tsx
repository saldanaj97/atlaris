'use client';

import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { SectionWithId } from '@/app/plans/new/components/usePdfExtractionDraft';
import type { JSX } from 'react';

interface PdfSectionEditorRowProps {
  section: SectionWithId;
  index: number;
  disabled?: boolean;
  onTitleChange: (sectionId: string, value: string) => void;
  onContentChange: (sectionId: string, value: string) => void;
}

export function PdfSectionEditorRow({
  section,
  index,
  disabled = false,
  onTitleChange,
  onContentChange,
}: PdfSectionEditorRowProps): JSX.Element {
  return (
    <div className="dark:bg-input/20 dark:border-input/50 bg-background/50 border-border hover:border-primary/30 rounded-xl border p-4 transition">
      <div className="mb-2 flex items-start justify-between gap-3">
        <label className="sr-only" htmlFor={`section-title-${section.id}`}>
          Section {index + 1} title
        </label>
        <Input
          id={`section-title-${section.id}`}
          type="text"
          value={section.title}
          onChange={(event) => onTitleChange(section.id, event.target.value)}
          className="text-foreground h-auto flex-1 rounded-none border-0 bg-transparent p-0 text-sm font-medium shadow-none focus-visible:ring-1 md:text-sm"
          disabled={disabled}
        />
        <Badge variant="outline" className="text-xs">
          Level {section.level}
        </Badge>
      </div>
      <label className="sr-only" htmlFor={`section-content-${section.id}`}>
        Section {index + 1} content
      </label>
      <Textarea
        id={`section-content-${section.id}`}
        value={section.content}
        onChange={(event) => onContentChange(section.id, event.target.value)}
        rows={3}
        className="text-muted-foreground min-h-0 w-full resize-none rounded-none border-0 bg-transparent p-0 text-xs shadow-none focus-visible:ring-1 md:text-xs"
        disabled={disabled}
      />
    </div>
  );
}
