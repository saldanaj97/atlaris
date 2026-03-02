'use client';

import { Loader2 } from 'lucide-react';

export function PdfGeneratingState(): React.ReactElement {
  return (
    <div className="w-full max-w-3xl">
      <div className="dark:border-border dark:bg-card/60 border-border bg-card/60 relative rounded-3xl border px-6 py-12 shadow-2xl backdrop-blur-xl">
        <div className="flex flex-col items-center text-center">
          <div className="from-primary to-accent mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-linear-to-br shadow-lg">
            <Loader2 className="h-10 w-10 animate-spin text-white" />
          </div>
          <h3 className="text-foreground mb-2 text-xl font-semibold">
            Creating your learning plan...
          </h3>
          <p className="text-muted-foreground text-sm">
            This will only take a moment
          </p>
        </div>
      </div>
    </div>
  );
}
