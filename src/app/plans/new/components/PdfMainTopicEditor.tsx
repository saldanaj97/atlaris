'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { JSX } from 'react';

interface PdfMainTopicEditorProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function PdfMainTopicEditor({
  id,
  value,
  onChange,
  disabled = false,
}: PdfMainTopicEditorProps): JSX.Element {
  return (
    <div>
      <Label
        htmlFor={id}
        className="text-foreground mb-2 block text-sm font-medium"
      >
        Main Topic
      </Label>
      <Input
        id={id}
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="border-border bg-background text-foreground focus-visible:border-primary focus-visible:ring-primary/20 dark:border-input dark:bg-input/30 dark:text-foreground h-auto w-full rounded-xl px-4 py-3 text-base shadow-none focus-visible:ring-2 md:text-base"
        disabled={disabled}
      />
    </div>
  );
}
