import { Suspense } from 'react';

import { Card } from '@/components/ui/card';

import {
  ModelSelectionCard,
  ModelSelectionCardSkeleton,
} from './components/ModelSelectionCard';

/**
 * AI Settings page with Suspense boundary for data-dependent content.
 *
 * Static elements (title, subtitle, About AI Models card) render immediately.
 * Only the Model Selection card waits for user tier data.
 */
export default function AISettingsPage() {
  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-7xl px-6 py-8">
        {/* Static content - renders immediately */}
        <h1 className="mb-2 text-3xl font-bold">AI Preferences</h1>
        <p className="text-muted-foreground mb-6">
          Choose your preferred AI model for generating learning plans.
          Different models offer varying levels of quality, speed, and cost.
        </p>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Data-dependent card - wrapped in Suspense */}
          <Suspense fallback={<ModelSelectionCardSkeleton />}>
            <ModelSelectionCard />
          </Suspense>

          {/* Static content - renders immediately */}
          <Card className="p-6">
            <h2 className="mb-4 text-xl font-semibold">About AI Models</h2>
            <div className="text-muted-foreground space-y-4 text-sm">
              <p>
                We offer a variety of AI models from leading providers including
                Google, OpenAI, Anthropic, and Alibaba. Each model has different
                strengths:
              </p>
              <ul className="list-inside list-disc space-y-2">
                <li>
                  <strong>Free models</strong> - Great quality at no cost,
                  perfect for most learning plans
                </li>
                <li>
                  <strong>Pro models</strong> - Advanced reasoning and larger
                  context windows for complex topics
                </li>
              </ul>
              <p>
                Your selected model will be used for all future plan
                generations. You can change it at any time.
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
      </div>
    </div>
  );
}
