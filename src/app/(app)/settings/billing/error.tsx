'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { clientLogger } from '@/lib/logging/client';

interface ErrorProps {
	error: Error & { digest?: string };
	reset: () => void;
}

/**
 * Route-level error boundary for billing settings page.
 * Catches unexpected runtime errors and provides a recovery option.
 */
export default function BillingError({ error, reset }: ErrorProps) {
	useEffect(() => {
		clientLogger.error('Billing page error:', {
			errorDigest: error.digest,
			message: error.message,
			stack: error.stack,
		});
	}, [error]);

	return (
		<>
			<PageHeader title="Billing" titleAs="h2" />
			<Card className="p-6" role="alert">
				<h3 className="mb-2 text-xl font-semibold text-red-600">
					Error Loading Billing Information
				</h3>
				<p className="text-muted-foreground mb-4">
					We couldn&apos;t load your billing information. This could be a
					temporary issue.
				</p>
				<Button onClick={reset} variant="default">
					Try Again
				</Button>
			</Card>
		</>
	);
}
