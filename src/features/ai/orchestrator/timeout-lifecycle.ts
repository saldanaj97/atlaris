import { attachAbortListener } from '@/features/ai/abort';
import { createAdaptiveTimeout } from '@/features/ai/timeout';
import type { AdaptiveTimeoutConfig } from '@/features/ai/types/timeout.types';
import { aiTimeoutEnv } from '@/lib/config/env';

export type TimeoutLifecycle = {
	timeout: ReturnType<typeof createAdaptiveTimeout>;
	cleanupTimeoutAbort: () => void;
	cleanupExternalAbort: (() => void) | undefined;
};

export function resolveTimeoutConfig(
	timeoutConfig?: Partial<AdaptiveTimeoutConfig>,
	clock?: () => number,
): AdaptiveTimeoutConfig {
	const {
		baseMs = aiTimeoutEnv.baseMs,
		extensionMs = aiTimeoutEnv.extensionMs,
		extensionThresholdMs = aiTimeoutEnv.extensionThresholdMs,
	} = timeoutConfig ?? {};

	return {
		baseMs,
		extensionMs,
		extensionThresholdMs,
		now: clock,
	};
}

export function setupAbortAndTimeout(
	timeoutConfig: AdaptiveTimeoutConfig,
	externalSignal?: AbortSignal,
): TimeoutLifecycle & { controller: AbortController } {
	const timeout = createAdaptiveTimeout(timeoutConfig);
	const controller = new AbortController();
	const onAbort = () => controller.abort();
	const cleanupTimeoutAbort = attachAbortListener(timeout.signal, onAbort);
	const cleanupExternalAbort = externalSignal
		? attachAbortListener(externalSignal, onAbort)
		: undefined;

	return { timeout, controller, cleanupTimeoutAbort, cleanupExternalAbort };
}

export function cleanupTimeoutLifecycle(
	timeoutLifecycle: TimeoutLifecycle,
): void {
	timeoutLifecycle.timeout.cancel();
	timeoutLifecycle.cleanupTimeoutAbort();
	timeoutLifecycle.cleanupExternalAbort?.();
}
