'use client';

import { Button } from '@/components/ui/button';
import { ArrowRight, Sparkles } from 'lucide-react';
import type { JSX } from 'react';

interface PdfPreviewActionsProps {
  mainTopic: string;
  isGenerating: boolean;
  canGenerate: boolean;
  onGenerate: () => void;
  onSwitchToManual?: (mainTopic: string) => void;
}

export function PdfPreviewActions({
  mainTopic,
  isGenerating,
  canGenerate,
  onGenerate,
  onSwitchToManual,
}: PdfPreviewActionsProps): JSX.Element {
  return (
    <div className="mt-6 flex items-center justify-between">
      {onSwitchToManual ? (
        <Button
          type="button"
          variant="link"
          onClick={() => onSwitchToManual(mainTopic)}
          className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm underline-offset-4 transition hover:underline"
        >
          <Sparkles className="h-3.5 w-3.5" />
          Not what you expected? Try generating manually
        </Button>
      ) : (
        <div />
      )}
      <Button
        type="button"
        onClick={onGenerate}
        disabled={isGenerating || !canGenerate}
        className="group bg-primary hover:bg-primary/90 shadow-primary/25 hover:shadow-primary/30 h-auto rounded-2xl px-6 py-3 text-white shadow-xl transition hover:-translate-y-0.5 hover:shadow-2xl disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-xl"
      >
        <span className="font-medium">
          {isGenerating ? 'Generating...' : 'Generate Learning Plan'}
        </span>
        {!isGenerating && (
          <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
        )}
      </Button>
    </div>
  );
}
