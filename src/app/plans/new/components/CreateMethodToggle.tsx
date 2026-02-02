'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { FileText, Sparkles } from 'lucide-react';

export type CreateMethod = 'manual' | 'pdf';

interface CreateMethodToggleProps {
  value: CreateMethod;
  onChange: (method: CreateMethod) => void;
  disabled?: boolean;
}

export function CreateMethodToggle({
  value,
  onChange,
  disabled = false,
}: CreateMethodToggleProps): React.ReactElement {
  return (
    <div
      role="tablist"
      aria-label="Plan creation method"
      className="dark:border-border dark:bg-card/50 inline-flex items-center gap-1 rounded-full border border-white/40 bg-white/30 p-1 shadow-lg backdrop-blur-sm"
    >
      <Button
        type="button"
        variant="ghost"
        role="tab"
        aria-selected={value === 'manual'}
        aria-controls="manual-panel"
        id="manual-tab"
        disabled={disabled}
        onClick={() => onChange('manual')}
        className={cn(
          'h-auto rounded-full px-4 py-2 text-sm font-medium transition-all',
          value === 'manual'
            ? 'from-primary to-accent bg-gradient-to-r text-white shadow-md hover:bg-gradient-to-r hover:text-white'
            : 'text-muted-foreground hover:text-foreground hover:bg-white/50 dark:hover:bg-white/10'
        )}
      >
        <Sparkles className="h-4 w-4" />
        <span>Type Topic</span>
      </Button>
      <Button
        type="button"
        variant="ghost"
        role="tab"
        aria-selected={value === 'pdf'}
        aria-controls="pdf-panel"
        id="pdf-tab"
        disabled={disabled}
        onClick={() => onChange('pdf')}
        className={cn(
          'h-auto rounded-full px-4 py-2 text-sm font-medium transition-all',
          value === 'pdf'
            ? 'from-primary to-accent bg-gradient-to-r text-white shadow-md hover:bg-gradient-to-r hover:text-white'
            : 'text-muted-foreground hover:text-foreground hover:bg-white/50 dark:hover:bg-white/10'
        )}
      >
        <FileText className="h-4 w-4" />
        <span>Upload PDF</span>
      </Button>
    </div>
  );
}
