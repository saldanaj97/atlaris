import type { ReactElement } from 'react';
import { Suspense } from 'react';
import { ModelSelectionCard } from '@/app/settings/ai/components/ModelSelectionCard';
import { ModelSelectionCardSkeleton } from '@/app/settings/ai/components/ModelSelectionCardSkeleton';
import { Card } from '@/components/ui/card';

/**
 * AI Settings sub-page.
 *
 * Rendered inside the shared settings layout.
 * Only the Model Selection card waits for user tier data.
 */
export default function AISettingsPage(): ReactElement {
  return (
    <>
      <header className="mb-6">
        <h2 className="text-xl font-semibold">AI Preferences</h2>
        <p className="text-muted-foreground text-sm">
          Choose a saveable model for new plan generations. If you do not save a
          preference, Atlaris uses your tier&apos;s default model (including the
          automatic free router when applicable). A valid one-off{' '}
          <code className="font-mono text-xs">?model=</code> on a generation
          request still overrides your saved choice for that request only.
        </p>
      </header>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Data-dependent card - wrapped in Suspense */}
        <Suspense fallback={<ModelSelectionCardSkeleton />}>
          <ModelSelectionCard />
        </Suspense>

        {/* Static content - renders immediately */}
        <Card className="p-6">
          <h3 className="mb-4 text-xl font-semibold">About AI Models</h3>
          <div className="text-muted-foreground space-y-4 text-sm">
            <p>
              We offer a variety of AI models from leading providers including
              Google, OpenAI, Anthropic, and Alibaba. Each model has different
              strengths:
            </p>
            <ul className="list-inside list-disc space-y-2">
              <li>
                <strong>Free models</strong> - Great quality at no cost, perfect
                for most learning plans
              </li>
              <li>
                <strong>Pro models</strong> - Advanced reasoning and larger
                context windows for complex topics
              </li>
            </ul>
            <p>
              A saved model applies to future plan generations until you change
              it. Only explicitly listed models can be saved; the automatic
              router fallback is used at runtime when no preference is stored.
            </p>
            <div className="border-border bg-muted/50 mt-4 rounded-lg border p-3">
              <p className="text-xs">
                <strong>Note:</strong> Model availability and pricing may
                change. Free models are always available to all users.
              </p>
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}
