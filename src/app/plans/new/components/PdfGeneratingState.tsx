'use client';

import type { ReactElement } from 'react';

import { Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/card';

export function PdfGeneratingState(): ReactElement {
  return (
    <div className="w-full max-w-3xl">
      <Card className="border-border bg-card/60 relative rounded-3xl px-6 py-12 shadow-2xl backdrop-blur-xl">
        <div
          className="flex flex-col items-center text-center"
          role="status"
          aria-live="polite"
        >
          <div className="from-primary to-accent mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-linear-to-br shadow-lg">
            <Loader2
              className="h-10 w-10 animate-spin text-white"
              aria-hidden="true"
            />
          </div>
          <h3 className="text-foreground mb-2 text-xl font-semibold">
            Creating your learning plan...
          </h3>
          <p className="text-muted-foreground text-sm">
            This will only take a moment
          </p>
        </div>
      </Card>
    </div>
  );
}
