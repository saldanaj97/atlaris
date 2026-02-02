'use client';

import { MouseGlowContainer } from '@/components/effects/MouseGlow';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useId, useState } from 'react';

import {
  CreateMethodToggle,
  type CreateMethod,
} from './components/CreateMethodToggle';
import { ManualCreatePanel } from './components/ManualCreatePanel';
import { PdfCreatePanel } from './components/PdfCreatePanel';

function CreatePlanContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const panelIdBase = useId();
  const manualPanelId = `${panelIdBase}-manual-panel`;
  const pdfPanelId = `${panelIdBase}-pdf-panel`;

  const methodParam = searchParams.get('method');
  const currentMethod: CreateMethod = methodParam === 'pdf' ? 'pdf' : 'manual';

  const [prefillTopic, setPrefillTopic] = useState<string | null>(null);

  const handleMethodChange = useCallback(
    (method: CreateMethod) => {
      const params = new URLSearchParams(searchParams.toString());
      if (method === 'manual') {
        params.delete('method');
      } else {
        params.set('method', method);
      }
      const queryString = params.toString();
      router.push(`/plans/new${queryString ? `?${queryString}` : ''}`, {
        scroll: false,
      });
    },
    [router, searchParams]
  );

  const handleSwitchToManual = useCallback(
    (extractedTopic: string) => {
      setPrefillTopic(extractedTopic);
      handleMethodChange('manual');
    },
    [handleMethodChange]
  );

  const handleTopicUsed = useCallback(() => {
    setPrefillTopic(null);
  }, []);

  return (
    <>
      <div className="mb-8 text-center">
        <div className="dark:border-border dark:bg-card/50 border-primary/30 mb-4 inline-flex items-center rounded-full border bg-white/50 px-4 py-2 shadow-lg backdrop-blur-sm">
          <span className="from-primary to-accent mr-2 h-2 w-2 rounded-full bg-gradient-to-r" />
          <span className="text-primary text-sm font-medium">
            AI-Powered Learning Plans
          </span>
        </div>

        <h1 className="text-foreground mb-3 text-4xl font-bold tracking-tight md:text-5xl">
          What do you want to{' '}
          <span className="from-primary via-accent to-primary bg-gradient-to-r bg-clip-text text-transparent">
            learn?
          </span>
        </h1>

        <p className="text-muted-foreground mx-auto max-w-xl text-lg">
          {currentMethod === 'manual'
            ? "Describe your learning goal. We'll create a personalized, time-blocked schedule that syncs to your calendar."
            : "Upload a PDF document and we'll extract the key topics to create a personalized learning plan."}
        </p>
      </div>

      <div className="mb-8">
        <CreateMethodToggle
          value={currentMethod}
          onChange={handleMethodChange}
        />
      </div>

      <div
        id={manualPanelId}
        role="tabpanel"
        aria-labelledby="manual-tab"
        aria-hidden={currentMethod !== 'manual'}
        className={currentMethod !== 'manual' ? 'hidden' : undefined}
      >
        <ManualCreatePanel
          initialTopic={prefillTopic}
          onTopicUsed={handleTopicUsed}
        />
      </div>

      <div
        id={pdfPanelId}
        role="tabpanel"
        aria-labelledby="pdf-tab"
        aria-hidden={currentMethod !== 'pdf'}
        className={currentMethod !== 'pdf' ? 'hidden' : undefined}
      >
        <PdfCreatePanel onSwitchToManual={handleSwitchToManual} />
      </div>
    </>
  );
}

function CreatePlanLoading() {
  return (
    <div className="flex flex-col items-center">
      <div className="mb-8 text-center">
        <div className="dark:border-border dark:bg-card/50 border-primary/30 mb-4 inline-flex items-center rounded-full border bg-white/50 px-4 py-2 shadow-lg backdrop-blur-sm">
          <span className="from-primary to-accent mr-2 h-2 w-2 rounded-full bg-gradient-to-r" />
          <span className="text-primary text-sm font-medium">
            AI-Powered Learning Plans
          </span>
        </div>

        <h1 className="text-foreground mb-3 text-4xl font-bold tracking-tight md:text-5xl">
          What do you want to{' '}
          <span className="from-primary via-accent to-primary bg-gradient-to-r bg-clip-text text-transparent">
            learn?
          </span>
        </h1>

        <p className="text-muted-foreground mx-auto max-w-xl text-lg">
          Loading...
        </p>
      </div>

      <div className="mb-8">
        <div className="dark:border-border dark:bg-card/50 inline-flex h-12 w-64 animate-pulse items-center gap-1 rounded-full border border-white/40 bg-white/30 p-1 shadow-lg backdrop-blur-sm" />
      </div>
    </div>
  );
}

export default function CreateNewPlanPage() {
  return (
    <MouseGlowContainer className="from-accent/30 via-primary/10 to-accent/20 dark:bg-background fixed inset-0 overflow-hidden bg-linear-to-br dark:from-transparent dark:via-transparent dark:to-transparent">
      <div
        className="from-primary/30 to-accent/20 absolute top-20 -left-20 h-96 w-96 rounded-full bg-linear-to-br opacity-60 blur-3xl dark:opacity-30"
        aria-hidden="true"
      />
      <div
        className="from-primary/30 to-accent/20 absolute top-40 -right-20 h-80 w-80 rounded-full bg-linear-to-br opacity-60 blur-3xl dark:opacity-30"
        aria-hidden="true"
      />
      <div
        className="from-primary/20 to-accent/15 absolute bottom-20 left-1/3 h-72 w-72 rounded-full bg-linear-to-br opacity-60 blur-3xl dark:opacity-30"
        aria-hidden="true"
      />

      <div className="relative z-10 flex h-full flex-col items-center justify-center overflow-y-auto px-6 py-8">
        <Suspense fallback={<CreatePlanLoading />}>
          <CreatePlanContent />
        </Suspense>
      </div>
    </MouseGlowContainer>
  );
}
