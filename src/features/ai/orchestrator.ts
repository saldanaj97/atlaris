import { finalizeGenerationFailure } from '@/features/ai/orchestrator/attempt-failures';
import { generateWithInstrumentation } from '@/features/ai/orchestrator/provider-invocation';
import { createReservationRejectionResult } from '@/features/ai/orchestrator/reservation';
import {
	cleanupTimeoutLifecycle,
	resolveTimeoutConfig,
	setupAbortAndTimeout,
} from '@/features/ai/orchestrator/timeout-lifecycle';
import { pacePlan } from '@/features/ai/pacing';
import { parseGenerationStream } from '@/features/ai/parser';
import { getGenerationProvider } from '@/features/ai/providers/factory';
import type {
	AttemptOperations,
	AttemptOperationsOverrides,
	GenerationAttemptContext,
	GenerationResult,
	RunGenerationOptions,
} from '@/features/ai/types/orchestrator.types';
import type { ProviderMetadata } from '@/features/ai/types/provider.types';
import {
	finalizeAttemptFailure,
	finalizeAttemptSuccess,
	reserveAttemptSlot,
} from '@/lib/db/queries/attempts';
import { isAttemptsDbClient } from '@/lib/db/queries/helpers/attempts-persistence';

const DEFAULT_CLOCK = () => Date.now();

function resolveAttemptOperations(
	overrides?: AttemptOperationsOverrides,
): AttemptOperations {
	return {
		reserveAttemptSlot: overrides?.reserveAttemptSlot ?? reserveAttemptSlot,
		finalizeAttemptSuccess:
			overrides?.finalizeAttemptSuccess ?? finalizeAttemptSuccess,
		finalizeAttemptFailure:
			overrides?.finalizeAttemptFailure ?? finalizeAttemptFailure,
	};
}

export async function runGenerationAttempt(
	context: GenerationAttemptContext,
	options: RunGenerationOptions,
): Promise<GenerationResult> {
	const clock = options.clock ?? DEFAULT_CLOCK;
	const nowFn = options.now ?? (() => new Date());
	const dbClient = options.dbClient;

	if (!isAttemptsDbClient(dbClient)) {
		throw new Error(
			'runGenerationAttempt requires dbClient (pass request-scoped getDb() from API routes)',
		);
	}

	const attemptOps = resolveAttemptOperations(options.attemptOperations);
	const timeoutConfig = resolveTimeoutConfig(options.timeoutConfig, clock);
	const attemptClockStart = clock();

	const reservation =
		options.reservation ??
		(await attemptOps.reserveAttemptSlot({
			planId: context.planId,
			userId: context.userId,
			input: context.input,
			dbClient,
			now: nowFn,
		}));

	if (!reservation.reserved) {
		return createReservationRejectionResult(
			context,
			reservation,
			attemptClockStart,
			clock,
			nowFn,
		);
	}

	const provider = options.provider ?? getGenerationProvider();

	let setup: ReturnType<typeof setupAbortAndTimeout>;
	try {
		setup = setupAbortAndTimeout(timeoutConfig, options.signal);
	} catch (error) {
		return finalizeGenerationFailure({
			error,
			reservation,
			attemptOps,
			context,
			attemptClockStart,
			clock,
			nowFn,
			dbClient,
		});
	}

	const { timeout, controller, cleanupTimeoutAbort, cleanupExternalAbort } =
		setup;
	let providerMetadata: ProviderMetadata | undefined;
	let rawText: string | undefined;

	try {
		const providerResult = await generateWithInstrumentation(
			provider,
			context.input,
			{
				signal: controller.signal,
				timeoutMs: timeoutConfig.baseMs,
			},
		);
		providerMetadata = providerResult.metadata;

		const parsed = await parseGenerationStream(providerResult.stream, {
			onFirstModuleDetected: () => timeout.notifyFirstModule(),
			signal: controller.signal,
		});
		rawText = parsed.rawText;

		const modules = pacePlan(parsed.modules, context.input);
		const durationMs = Math.max(0, clock() - attemptClockStart);
		cleanupTimeoutLifecycle({
			timeout,
			cleanupTimeoutAbort,
			cleanupExternalAbort,
		});

		const metadata = providerMetadata ?? {};
		const attempt = await attemptOps.finalizeAttemptSuccess({
			attemptId: reservation.attemptId,
			planId: context.planId,
			preparation: reservation,
			modules,
			providerMetadata: metadata,
			durationMs,
			extendedTimeout: timeout.didExtend,
			dbClient,
			now: nowFn,
		});

		return {
			status: 'success',
			classification: null,
			modules,
			rawText: parsed.rawText,
			metadata,
			durationMs,
			extendedTimeout: timeout.didExtend,
			timedOut: false,
			attempt,
		};
	} catch (error) {
		return finalizeGenerationFailure({
			error,
			reservation,
			attemptOps,
			context,
			attemptClockStart,
			clock,
			nowFn,
			dbClient,
			timeoutLifecycle: {
				timeout,
				cleanupTimeoutAbort,
				cleanupExternalAbort,
			},
			providerMetadata,
			rawText,
		});
	}
}
