'use client';

import type { JSX } from 'react';
import type { SectionWithId } from '@/app/plans/new/components/usePdfExtractionDraft';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

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
    <Card className="dark:bg-input/20 dark:border-input/50 bg-background/50 hover:border-primary/30 gap-0 rounded-xl py-0 transition">
      <CardHeader className="flex flex-row items-start justify-between gap-3 p-4 pb-2">
        <div className="flex-1">
          <Label className="sr-only" htmlFor={`section-title-${section.id}`}>
            Section {index + 1} title
          </Label>
          <Input
            id={`section-title-${section.id}`}
            type="text"
            value={section.title}
            onChange={(event) => onTitleChange(section.id, event.target.value)}
            className="text-foreground h-auto flex-1 rounded-none border-0 bg-transparent p-0 text-sm font-medium shadow-none focus-visible:ring-1 md:text-sm"
            disabled={disabled}
          />
        </div>
        <Badge variant="outline" className="text-xs">
          Level {section.level}
        </Badge>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <Label className="sr-only" htmlFor={`section-content-${section.id}`}>
          Section {index + 1} content
        </Label>
        <Textarea
          id={`section-content-${section.id}`}
          value={section.content}
          onChange={(event) => onContentChange(section.id, event.target.value)}
          rows={3}
          className="text-muted-foreground min-h-0 w-full resize-none rounded-none border-0 bg-transparent p-0 text-xs shadow-none focus-visible:ring-1 md:text-xs"
          disabled={disabled}
        />
      </CardContent>
    </Card>
  );
}
