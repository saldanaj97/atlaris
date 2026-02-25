'use client';

import {
  CreateMethodToggle,
  type CreateMethod,
} from '@/app/plans/new/components/CreateMethodToggle';
import { ManualCreatePanel } from '@/app/plans/new/components/ManualCreatePanel';
import { useRouter } from 'next/navigation';
import React, { Suspense, useCallback, useId, useState } from 'react';

const PdfCreatePanel = React.lazy(() =>
  import('@/app/plans/new/components/PdfCreatePanel').then((module) => ({
    default: module.PdfCreatePanel,
  }))
);

interface CreatePlanPageClientProps {
  initialMethod: CreateMethod;
  initialTopic?: string | null;
  initialTopicResetVersion?: number;
}

export function CreatePlanPageClient({
  initialMethod,
  initialTopic,
  initialTopicResetVersion = 0,
}: CreatePlanPageClientProps): React.ReactElement {
  const router = useRouter();
  const panelIdBase = useId();
  const tabIdBase = useId();
  const manualPanelId = `${panelIdBase}-manual-panel`;
  const pdfPanelId = `${panelIdBase}-pdf-panel`;
  const manualTabId = `${tabIdBase}-manual-tab`;
  const pdfTabId = `${tabIdBase}-pdf-tab`;
  const currentMethod = initialMethod;
  const [pdfOpened, setPdfOpened] = useState(initialMethod === 'pdf');
  const [prefillTopic, setPrefillTopic] = useState<string | null>(
    initialTopic ?? null
  );
  const [topicResetVersion, setTopicResetVersion] = useState(
    initialTopicResetVersion
  );

  const handleMethodChange = useCallback(
    (method: CreateMethod) => {
      if (method === 'pdf') {
        setPdfOpened(true);
      }
      const targetUrl =
        method === 'manual' ? '/plans/new' : '/plans/new?method=pdf';
      router.push(targetUrl, { scroll: false });
    },
    [router]
  );

  const handleSwitchToManual = useCallback(
    (extractedTopic: string) => {
      setPrefillTopic(extractedTopic);
      setTopicResetVersion((currentVersion) => currentVersion + 1);
      router.push('/plans/new', { scroll: false });
    },
    [router]
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
          manualPanelId={manualPanelId}
          pdfPanelId={pdfPanelId}
          manualTabId={manualTabId}
          pdfTabId={pdfTabId}
        />
      </div>

      {/* Both panels are always mounted to preserve state and avoid broken ARIA targets.
         The inactive panel uses hidden + inert to hide from the a11y tree. */}
      <div
        id={manualPanelId}
        role="tabpanel"
        aria-labelledby={manualTabId}
        hidden={currentMethod !== 'manual'}
        inert={currentMethod !== 'manual' ? true : undefined}
      >
        <ManualCreatePanel
          initialTopic={prefillTopic}
          topicResetVersion={topicResetVersion}
          onTopicUsed={handleTopicUsed}
        />
      </div>

      <div
        id={pdfPanelId}
        role="tabpanel"
        aria-labelledby={pdfTabId}
        hidden={currentMethod !== 'pdf'}
        inert={currentMethod !== 'pdf' ? true : undefined}
      >
        <Suspense
          fallback={
            <div className="text-muted-foreground text-center text-sm">
              Loading PDF options...
            </div>
          }
        >
          {pdfOpened && (
            <PdfCreatePanel onSwitchToManual={handleSwitchToManual} />
          )}
        </Suspense>
      </div>
    </>
  );
}
