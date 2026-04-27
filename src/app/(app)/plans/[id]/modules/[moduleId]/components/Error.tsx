import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

import { Surface } from '@/components/ui/surface';

interface ModuleDetailPageErrorProps {
	message?: string;
	planId?: string;
}

/**
 * Renders a full-screen error UI for the module detail page.
 *
 * Displays a prominent "Error Loading Module" heading, a provided error message or a default
 * fallback message, and navigation options back to the plan or plans list.
 *
 * @param message - Optional custom error message to display instead of the default text
 * @param planId - Optional plan ID for navigation back to the plan
 * @returns The React element representing the error page UI
 */
export function ModuleDetailPageError({
	message,
	planId,
}: ModuleDetailPageErrorProps) {
	return (
		<div
			role="alert"
			className="flex min-h-[60vh] flex-col items-center justify-center p-4"
		>
			<Surface
				padding="none"
				className="max-w-lg rounded-3xl p-8 text-center shadow-md"
			>
				<h1 className="mb-4 text-2xl font-bold text-red-600 dark:text-red-400">
					Error Loading Module
				</h1>
				<p className="text-foreground/90 mb-6 max-w-md">
					{message ??
						'There was an error loading the module. Please try again later.'}
				</p>
				<div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
					{planId && (
						<Link
							href={`/plans/${planId}`}
							className="bg-primary hover:bg-primary/90 inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-white transition"
						>
							<ArrowLeft className="h-4 w-4" />
							Back to Plan
						</Link>
					)}
					<Link
						href="/plans"
						className="inline-flex items-center justify-center rounded-xl border border-border bg-background px-4 py-2 text-foreground transition hover:bg-muted"
					>
						View All Plans
					</Link>
				</div>
			</Surface>
		</div>
	);
}
