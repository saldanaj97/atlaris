/**
 * PlanLifecycleService — orchestrates plan creation through port interfaces.
 *
 * This service has ZERO direct imports from billing, AI, DB, or job modules.
 * All interaction with external concerns goes through injected ports.
 *
 * Returns discriminated union results for expected lifecycle outcomes.
 * Only unexpected errors (bugs) propagate as thrown exceptions.
 */

import { logger } from '@/lib/logging/logger';
import { type CreationGatePorts, checkCreationGate } from './creation-pipeline';
import { createAiPlanWithStrategy } from './origin-strategies/create-ai-plan';
import type {
	GenerationPort,
	JobQueuePort,
	PlanPersistencePort,
	QuotaPort,
	UsageRecordingPort,
} from './ports';
import type {
	CreateAiPlanInput,
	CreatePlanResult,
	GenerationAttemptResult,
	ProcessGenerationInput,
} from './types';
import { isRetryableClassification } from './types';

export interface PlanLifecycleServicePorts {
	readonly planPersistence: PlanPersistencePort;
	readonly quota: QuotaPort;
	readonly generation: GenerationPort;
	readonly usageRecording: UsageRecordingPort;
	readonly jobQueue: JobQueuePort;
}

export class PlanLifecycleService {
	private readonly ports: PlanLifecycleServicePorts;

	constructor(ports: PlanLifecycleServicePorts) {
		this.ports = ports;
	}

	private creationGatePorts(): CreationGatePorts {
		return {
			findCappedPlanWithoutModules: (userId: string) =>
				this.ports.planPersistence.findCappedPlanWithoutModules(userId),
			resolveUserTier: (userId: string) =>
				this.ports.quota.resolveUserTier(userId),
			checkDurationCap: (params) => this.ports.quota.checkDurationCap(params),
			normalizePlanDuration: (params) =>
				this.ports.quota.normalizePlanDuration(params),
		};
	}

	/**
	 * Create a new AI-origin learning plan.
	 *
	 * Flow: validate → resolve tier → check requested duration cap → normalize duration
	 *       → check normalized duration cap → check attempt cap → prepare input → atomic insert
	 *
	 * @returns A discriminated union result — never throws for lifecycle outcomes.
	 */
	async createPlan(input: CreateAiPlanInput): Promise<CreatePlanResult> {
		const gate = await checkCreationGate(this.creationGatePorts(), {
			userId: input.userId,
			weeklyHours: input.weeklyHours,
			startDate: input.startDate ?? null,
			deadlineDate: input.deadlineDate ?? null,
			lifecycleLabel: 'create',
		});
		if (gate.blocked) {
			return gate.result;
		}

		return createAiPlanWithStrategy(this.ports, {
			input,
			tier: gate.tier,
			duration: gate.duration,
		});
	}

	/**
	 * Process a generation attempt for an existing plan.
	 *
	 * Flow: run generation → on success: mark ready + record usage
	 *       → on retryable failure: mark failed (no usage)
	 *       → on permanent failure: mark failed + record usage
	 *
	 * @returns A discriminated union result — never throws for lifecycle outcomes.
	 */
	async processGenerationAttempt(
		input: ProcessGenerationInput,
	): Promise<GenerationAttemptResult> {
		logger.info(
			{ planId: input.planId, userId: input.userId, tier: input.tier },
			'plan.lifecycle.generation: attempt started',
		);

		// 1. Run generation via port
		const generationResult = await this.ports.generation.runGeneration({
			planId: input.planId,
			userId: input.userId,
			tier: input.tier,
			input: input.input,
			modelOverride: input.modelOverride,
			signal: input.signal,
		});

		// 2. Handle success
		if (generationResult.status === 'success') {
			await this.ports.planPersistence.markGenerationSuccess(input.planId);

			await this.ports.usageRecording.recordUsage({
				userId: input.userId,
				usage: generationResult.usage,
				kind: 'plan',
			});

			logger.info(
				{ planId: input.planId, durationMs: generationResult.durationMs },
				'plan.lifecycle.generation: success',
			);
			return {
				status: 'generation_success',
				data: {
					modules: generationResult.modules,
					metadata: generationResult.metadata,
					durationMs: generationResult.durationMs,
				},
			};
		}

		// 3. Handle failure — determine retryability
		const { classification, error } = generationResult;
		const retryable = isRetryableClassification(classification);

		// Always mark plan as failed
		await this.ports.planPersistence.markGenerationFailure(input.planId);

		if (retryable) {
			// Retryable failure — do NOT record usage (user will retry)
			logger.warn(
				{ planId: input.planId, classification },
				'plan.lifecycle.generation: retryable failure',
			);
			return {
				status: 'retryable_failure',
				classification,
				error,
			};
		}

		// Permanent failure — record usage if available (attempt consumed)
		if (generationResult.usage) {
			await this.ports.usageRecording.recordUsage({
				userId: input.userId,
				usage: generationResult.usage,
				kind: 'plan',
			});
		}

		logger.warn(
			{ planId: input.planId, classification },
			'plan.lifecycle.generation: permanent failure',
		);
		return {
			status: 'permanent_failure',
			classification,
			error,
		};
	}
}
