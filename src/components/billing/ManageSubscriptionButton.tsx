'use client';

import { type ReactElement, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { createPortalResponseSchema } from '@/features/billing/validation/stripe';
import { parseApiErrorResponse } from '@/lib/api/error-response';
import { clientLogger } from '@/lib/logging/client';

const PORTAL_TIMEOUT_MS = 15_000;

type ManageSubscriptionButtonProps = {
	label?: string;
	className?: string;
	returnUrl?: string;
	canOpenBillingPortal: boolean;
};

type PortalRequestResult =
	| { kind: 'success'; portalUrl: string }
	| {
			kind: 'error';
			message: string;
			error: unknown;
			reason:
				| 'timeout'
				| 'api'
				| 'invalid-response'
				| 'invalid-url'
				| 'network';
	  };

function isTimeoutError(error: unknown): error is DOMException {
	return error instanceof DOMException && error.name === 'TimeoutError';
}

function getErrorMessage(error: unknown, fallbackMessage: string): string {
	return error instanceof Error ? error.message : fallbackMessage;
}

function normalizePortalUrl(portalUrl: string): string | null {
	let parsedUrl: URL;

	try {
		parsedUrl = new URL(portalUrl);
	} catch {
		return null;
	}

	const isLocalHttp =
		parsedUrl.protocol === 'http:' &&
		(parsedUrl.hostname === 'localhost' || parsedUrl.hostname === '127.0.0.1');

	if (parsedUrl.protocol !== 'https:' && !isLocalHttp) {
		return null;
	}

	return parsedUrl.toString();
}

function createPortalTimeoutSignal(timeoutMs: number): {
	signal: AbortSignal;
	cleanup: () => void;
	didTimeout: () => boolean;
} {
	if (typeof AbortSignal.timeout === 'function') {
		const signal = AbortSignal.timeout(timeoutMs);
		let timedOut = false;

		const onAbort = (): void => {
			if (
				signal.reason instanceof DOMException &&
				signal.reason.name === 'TimeoutError'
			) {
				timedOut = true;
			}
		};

		signal.addEventListener('abort', onAbort);

		return {
			signal,
			cleanup: () => {
				signal.removeEventListener('abort', onAbort);
			},
			didTimeout: () => timedOut,
		};
	}

	const controller = new AbortController();
	let timedOut = false;
	const timeoutId = globalThis.setTimeout(() => {
		timedOut = true;
		controller.abort();
	}, timeoutMs);

	return {
		signal: controller.signal,
		cleanup: () => {
			globalThis.clearTimeout(timeoutId);
		},
		didTimeout: () => timedOut,
	};
}

async function requestBillingPortal(params: {
	returnUrl?: string;
}): Promise<PortalRequestResult> {
	const timeoutSignal = createPortalTimeoutSignal(PORTAL_TIMEOUT_MS);
	const responseResult = await fetch('/api/v1/stripe/create-portal', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({ returnUrl: params.returnUrl }),
		signal: timeoutSignal.signal,
	})
		.then((response) => ({ kind: 'response' as const, response }))
		.catch((error: unknown) => ({ kind: 'network-error' as const, error }))
		.finally(() => {
			timeoutSignal.cleanup();
		});

	if (responseResult.kind === 'network-error') {
		const requestTimedOut =
			isTimeoutError(responseResult.error) || timeoutSignal.didTimeout();

		return {
			kind: 'error',
			message: requestTimedOut
				? 'Request timed out — please try again'
				: getErrorMessage(responseResult.error, 'Something went wrong'),
			error: responseResult.error,
			reason: requestTimedOut ? 'timeout' : 'network',
		};
	}

	const { response } = responseResult;

	if (!response.ok) {
		const parsedError = await parseApiErrorResponse(
			response,
			'Failed to open billing portal',
		);
		return {
			kind: 'error',
			message: parsedError.error,
			error: new Error(parsedError.error),
			reason: 'api',
		};
	}

	const bodyResult = await response
		.json()
		.then((raw: unknown) => ({ kind: 'body' as const, raw }))
		.catch((error: unknown) => ({ kind: 'parse-error' as const, error }));

	if (bodyResult.kind === 'parse-error') {
		return {
			kind: 'error',
			message: 'Invalid billing portal response',
			error: bodyResult.error,
			reason: 'invalid-response',
		};
	}

	const parsed = createPortalResponseSchema.safeParse(bodyResult.raw);
	if (!parsed.success) {
		const portalUrlIssue = parsed.error.issues.find(
			(issue) => issue.path[0] === 'portalUrl',
		);
		return {
			kind: 'error',
			message:
				portalUrlIssue?.message ??
				parsed.error.issues[0]?.message ??
				'Invalid billing portal response',
			error: parsed.error,
			reason: 'invalid-response',
		};
	}

	const portalUrl = normalizePortalUrl(parsed.data.portalUrl);
	if (portalUrl === null) {
		return {
			kind: 'error',
			message: 'Billing portal returned an invalid redirect URL',
			error: new Error('Portal URL must use the https protocol'),
			reason: 'invalid-url',
		};
	}

	return {
		kind: 'success',
		portalUrl,
	};
}

export default function ManageSubscriptionButton({
	label = 'Manage Subscription',
	className,
	returnUrl,
	canOpenBillingPortal,
}: ManageSubscriptionButtonProps): ReactElement {
	const [loading, setLoading] = useState(false);
	const pendingRef = useRef(false);

	async function handleClick() {
		if (!canOpenBillingPortal || pendingRef.current) {
			return;
		}

		pendingRef.current = true;
		setLoading(true);

		let isRedirecting = false;

		await requestBillingPortal({ returnUrl })
			.then((result) => {
				if (result.kind === 'error') {
					if (result.reason === 'timeout') {
						clientLogger.warn('Billing portal request timed out', {
							returnUrl,
						});
					} else {
						clientLogger.error('Failed to open billing portal', {
							error: result.error,
							returnUrl,
						});
					}

					toast.error('Unable to open billing portal', {
						description: result.message,
					});
					return;
				}

				window.location.href = result.portalUrl;
				isRedirecting = true;
			})
			// Safety net: requestBillingPortal handles its own errors internally,
			// but .then() above (e.g. window.location assignment) could still throw.
			.catch((error: unknown) => {
				clientLogger.error('Unexpected billing portal failure', {
					error,
					returnUrl,
				});
				toast.error('Unable to open billing portal', {
					description: getErrorMessage(error, 'Something went wrong'),
				});
			})
			.finally(() => {
				pendingRef.current = false;

				if (!isRedirecting) {
					setLoading(false);
				}
			});
	}

	return (
		<Button
			className={className}
			disabled={loading || !canOpenBillingPortal}
			onClick={() => {
				void handleClick();
			}}
		>
			{loading ? 'Opening…' : label}
		</Button>
	);
}
