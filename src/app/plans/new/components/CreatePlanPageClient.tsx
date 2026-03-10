'use client';

import {
  CreateMethodToggle,
  type CreateMethod,
} from '@/app/plans/new/components/CreateMethodToggle';
import { ManualCreatePanel } from '@/app/plans/new/components/ManualCreatePanel';
import { Skeleton } from '@/components/ui/skeleton';
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
}

export function CreatePlanPageClient({
  initialMethod,
  initialTopic,
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
  const [topicResetVersion, setTopicResetVersion] = useState(0);

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
      <div className="mb-5 text-center sm:mb-6">
        <h1 className="text-foreground mb-2 text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
          What do you want to{' '}
          <span className="gradient-text-symmetric">learn?</span>
        </h1>

        <p className="text-muted-foreground mx-auto max-w-md text-base sm:max-w-xl sm:text-lg">
          {currentMethod === 'manual'
            ? "Describe your learning goal. We'll create a personalized, time-blocked schedule that syncs to your calendar."
            : "Upload a PDF document and we'll extract the key topics to create a personalized learning plan."}
        </p>
      </div>

      <div className="mb-5 sm:mb-6">
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
            <Skeleton
              className="mx-auto h-88 w-full max-w-2xl rounded-3xl"
              aria-label="Loading PDF options"
            />
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
