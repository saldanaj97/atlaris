import type { ReactElement } from 'react';
import { Suspense } from 'react';
import { ModelSelectionCard } from '@/app/(app)/settings/ai/components/ModelSelectionCard';
import { ModelSelectionCardSkeleton } from '@/app/(app)/settings/ai/components/ModelSelectionCardSkeleton';
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
					Save the model Atlaris should use for future plan generations. If you
					do not save one, your tier default applies. A one-off{' '}
					<code className="font-mono text-xs">?model=</code> still overrides a
					single generation request.
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
							Different models trade off speed, price, and reasoning quality.
						</p>
						<ul className="list-inside list-disc space-y-2">
							<li>
								<strong>Free models</strong> - Best for everyday plan generation
							</li>
							<li>
								<strong>Pro models</strong> - Better for harder topics and
								larger contexts
							</li>
						</ul>
						<p>
							Your saved model stays in effect until you change it. Only listed
							models can be saved.
						</p>
						<div className="border-border bg-muted/50 mt-4 rounded-lg border p-3">
							<p className="text-xs">
								<strong>Note:</strong> Availability and pricing can change over
								time.
							</p>
						</div>
					</div>
				</Card>
			</div>
		</>
	);
}
