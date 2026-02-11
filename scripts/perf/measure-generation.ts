#!/usr/bin/env tsx
/* eslint-disable no-console */

import 'dotenv/config';

import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';

import { count, eq, inArray } from 'drizzle-orm';

import { runGenerationAttempt } from '@/lib/ai/orchestrator';
import {
  ProviderTimeoutError,
  type AiPlanGenerationProvider,
  type GenerationInput,
  type GenerationOptions,
  type ProviderGenerateResult,
  type ProviderMetadata,
} from '@/lib/ai/provider';
import { ATTEMPT_CAP } from '@/lib/db/queries/attempts';
import { createUser, getUserByAuthId } from '@/lib/db/queries/users';
import { getDb } from '@/lib/db/runtime';
import { generationAttempts, learningPlans, modules } from '@/lib/db/schema';
import { client, db, isClientInitialized } from '@/lib/db/service-role';

interface Stats {
  count: number;
  min: number;
  max: number;
  mean: number;
  median: number;
  p95: number;
}

interface NormalizedStats extends Stats {}

interface GenerationMeasurement {
  syncDurations: number[];
  attemptDurations: number[];
}

interface ScenarioResult {
  status: 'success' | 'failure';
  classification: string | null;
  durationMs: number;
  timedOut: boolean;
  extendedTimeout: boolean;
}

class VirtualClock {
  private currentMs: number;

  constructor(startMs = Date.now()) {
    this.currentMs = startMs;
  }

  now(): number {
    return this.currentMs;
  }

  advance(milliseconds: number) {
    this.currentMs += Math.max(0, milliseconds);
  }

  nowDate(): Date {
    return new Date(this.currentMs);
  }
}

interface StreamSegment {
  chunk: string;
  advanceMs?: number;
}

class SimulatedSuccessProvider implements AiPlanGenerationProvider {
  constructor(
    private readonly clock: VirtualClock,
    private readonly segments: StreamSegment[],
    private readonly metadata: ProviderMetadata = {
      provider: 'simulated',
      model: 'simulated-success',
    }
  ) {}

  async generate(
    _input: GenerationInput,
    options?: GenerationOptions
  ): Promise<ProviderGenerateResult> {
    const signal = options?.signal;
    const segments = this.segments;
    const clock = this.clock;

    async function* iterator() {
      for (const segment of segments) {
        if (segment.advanceMs && segment.advanceMs > 0) {
          clock.advance(segment.advanceMs);
        }
        if (signal?.aborted) {
          throw new ProviderTimeoutError('Generation aborted by signal.');
        }
        yield segment.chunk;
      }
    }

    return {
      stream: iterator(),
      metadata: this.metadata,
    };
  }
}

class SimulatedTimeoutProvider implements AiPlanGenerationProvider {
  constructor(
    private readonly clock: VirtualClock,
    private readonly durationMs: number
  ) {}

  async generate(
    _input: GenerationInput,
    _options?: GenerationOptions
  ): Promise<ProviderGenerateResult> {
    this.clock.advance(this.durationMs);
    throw new ProviderTimeoutError('Simulated provider timeout.');
  }
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function percentile(sortedSamples: number[], fraction: number): number {
  if (sortedSamples.length === 0) {
    return 0;
  }

  const clampedFraction = Math.min(Math.max(fraction, 0), 1);
  const index = Math.ceil(clampedFraction * sortedSamples.length) - 1;
  const safeIndex = Math.min(Math.max(index, 0), sortedSamples.length - 1);
  return sortedSamples[safeIndex];
}

function computeStats(samples: number[]): Stats | null {
  if (samples.length === 0) {
    return null;
  }

  const sorted = [...samples].sort((a, b) => a - b);
  const sum = samples.reduce((total, value) => total + value, 0);
  const mean = sum / samples.length;
  const middle = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 1
      ? sorted[middle]
      : (sorted[middle - 1] + sorted[middle]) / 2;

  return {
    count: samples.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean,
    median,
    p95: percentile(sorted, 0.95),
  };
}

function normalizeStats(stats: Stats | null): NormalizedStats | null {
  if (!stats) return null;
  return {
    count: stats.count,
    min: round(stats.min),
    max: round(stats.max),
    mean: round(stats.mean),
    median: round(stats.median),
    p95: round(stats.p95),
  };
}

async function ensurePerfUser() {
  const authUserId = process.env.PERF_AUTH_USER_ID ?? 'perf-harness-user';
  const email =
    process.env.PERF_USER_EMAIL ?? 'perf-harness@learning-path.local';

  let user = await getUserByAuthId(authUserId);
  if (user) {
    return user;
  }

  user = await createUser({
    authUserId,
    email,
    name: 'Performance Harness User',
  });

  if (!user) {
    throw new Error('Failed to ensure performance harness user exists.');
  }

  return user;
}

async function cleanupUserArtifacts(userId: string) {
  await db.delete(learningPlans).where(eq(learningPlans.userId, userId));
}

async function findCappedPlanWithoutModules(
  userDbId: string
): Promise<string | null> {
  const planRows = await db
    .select({ id: learningPlans.id })
    .from(learningPlans)
    .where(eq(learningPlans.userId, userDbId));

  if (planRows.length === 0) {
    return null;
  }

  const planIds = planRows.map((row) => row.id);

  const attemptAggregates = await db
    .select({
      planId: generationAttempts.planId,
      count: count(generationAttempts.id).as('count'),
    })
    .from(generationAttempts)
    .where(inArray(generationAttempts.planId, planIds))
    .groupBy(generationAttempts.planId);

  if (attemptAggregates.length === 0) {
    return null;
  }

  const cappedPlanIds = attemptAggregates
    .filter((row) => row.count >= ATTEMPT_CAP)
    .map((row) => row.planId);

  if (cappedPlanIds.length === 0) {
    return null;
  }

  const plansWithModules = await db
    .select({ planId: modules.planId })
    .from(modules)
    .where(inArray(modules.planId, cappedPlanIds))
    .groupBy(modules.planId);

  const withModules = new Set(plansWithModules.map((row) => row.planId));

  return cappedPlanIds.find((planId) => !withModules.has(planId)) ?? null;
}

async function insertPlan(userId: string, topic: string) {
  const [plan] = await db
    .insert(learningPlans)
    .values({
      userId,
      topic,
      skillLevel: 'beginner',
      weeklyHours: 6,
      learningStyle: 'mixed',
      startDate: null,
      deadlineDate: null,
      visibility: 'private',
      origin: 'ai',
    })
    .returning({ id: learningPlans.id });

  if (!plan) {
    throw new Error('Failed to insert learning plan.');
  }

  return plan;
}

async function measureBaseline(userId: string, iterations: number) {
  const durations: number[] = [];

  for (let index = 0; index < iterations; index += 1) {
    const topic = `perf-baseline-${index}-${randomUUID()}`;
    const start = performance.now();
    const plan = await insertPlan(userId, topic);
    const duration = performance.now() - start;
    durations.push(duration);

    await db.delete(learningPlans).where(eq(learningPlans.id, plan.id));
  }

  return durations;
}

async function measureGenerationResponse(
  userId: string,
  iterations: number
): Promise<GenerationMeasurement> {
  const syncDurations: number[] = [];
  const attemptDurations: number[] = [];

  for (let index = 0; index < iterations; index += 1) {
    const cappedPlanId = await findCappedPlanWithoutModules(userId);
    if (cappedPlanId) {
      throw new Error(
        `Attempt cap reached for plan ${cappedPlanId}. Clean up attempts before rerunning.`
      );
    }

    const topic = `perf-generation-${index}-${randomUUID()}`;
    const start = performance.now();
    const plan = await insertPlan(userId, topic);
    const syncDuration = performance.now() - start;
    syncDurations.push(syncDuration);

    const input: GenerationInput = {
      topic,
      notes: null,
      skillLevel: 'beginner',
      weeklyHours: 6,
      learningStyle: 'mixed',
    };

    const result = await runGenerationAttempt(
      {
        planId: plan.id,
        userId,
        input,
      },
      { dbClient: getDb() }
    );

    attemptDurations.push(result.durationMs);

    await db.delete(learningPlans).where(eq(learningPlans.id, plan.id));
  }

  return { syncDurations, attemptDurations };
}

async function runSimulatedScenarios(userId: string) {
  const baseInput: GenerationInput = {
    topic: 'Performance Harness Simulation',
    notes: 'Simulated load case',
    skillLevel: 'intermediate',
    weeklyHours: 5,
    learningStyle: 'mixed',
  };

  const results: Record<string, ScenarioResult> = {};

  const createPlanForScenario = async (label: string) => {
    const plan = await insertPlan(
      userId,
      `perf-scenario-${label}-${randomUUID()}`
    );
    return plan.id;
  };

  const timeoutClock = new VirtualClock();
  const timeoutPlanId = await createPlanForScenario('timeout');
  const timeoutProvider = new SimulatedTimeoutProvider(timeoutClock, 10_000);
  const timeoutResult = await runGenerationAttempt(
    {
      planId: timeoutPlanId,
      userId,
      input: baseInput,
    },
    {
      provider: timeoutProvider,
      clock: () => timeoutClock.now(),
      now: () => timeoutClock.nowDate(),
      timeoutConfig: {
        baseMs: 10_000,
        extensionMs: 10_000,
        extensionThresholdMs: 9_500,
      },
      dbClient: getDb(),
    }
  );

  results.timeout = {
    status: timeoutResult.status,
    classification: timeoutResult.classification,
    durationMs: timeoutResult.durationMs,
    timedOut: timeoutResult.timedOut,
    extendedTimeout: timeoutResult.extendedTimeout,
  };

  await db.delete(learningPlans).where(eq(learningPlans.id, timeoutPlanId));

  const extendedClock = new VirtualClock();
  const extendedPlanId = await createPlanForScenario('extended');
  const extendedProvider = new SimulatedSuccessProvider(
    extendedClock,
    [
      {
        advanceMs: 9_000,
        chunk: '{"modules": [{"title": "Extended Timeout Module",',
      },
      {
        advanceMs: 10_400,
        chunk:
          ' "description": "Demonstrates timeout extension behaviour", "estimatedMinutes": 240, "tasks": [{"title": "Deep Dive Task", "description": "Long-running exploration", "estimatedMinutes": 60}]}',
      },
      { advanceMs: 0, chunk: ']}' },
    ],
    {
      provider: 'simulated',
      model: 'simulated-extended',
    }
  );

  const extendedResult = await runGenerationAttempt(
    {
      planId: extendedPlanId,
      userId,
      input: baseInput,
    },
    {
      provider: extendedProvider,
      clock: () => extendedClock.now(),
      now: () => extendedClock.nowDate(),
      timeoutConfig: {
        baseMs: 10_000,
        extensionMs: 10_000,
        extensionThresholdMs: 9_500,
      },
      dbClient: getDb(),
    }
  );

  results.extended = {
    status: extendedResult.status,
    classification: extendedResult.classification,
    durationMs: extendedResult.durationMs,
    timedOut: extendedResult.timedOut,
    extendedTimeout: extendedResult.extendedTimeout,
  };

  await db.delete(learningPlans).where(eq(learningPlans.id, extendedPlanId));

  return results;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is required.');
  }

  const iterationsArg = process.argv
    .find((arg) => arg.startsWith('--iterations='))
    ?.split('=')[1];

  const iterations = Number.parseInt(
    iterationsArg ?? process.env.PERF_ITERATIONS ?? '30',
    10
  );

  if (!Number.isFinite(iterations) || iterations <= 0) {
    throw new Error('Iterations count must be a positive integer.');
  }

  if (process.env.NODE_ENV === 'production') {
    console.warn(
      '[measure-generation] Running in production environment. Ensure this is intentional.'
    );
  }

  const user = await ensurePerfUser();
  await cleanupUserArtifacts(user.id);

  console.log('[measure-generation] Running baseline measurements...');
  const baselineSamples = await measureBaseline(user.id, iterations);

  console.log('[measure-generation] Running generation measurements...');
  const generationData = await measureGenerationResponse(user.id, iterations);

  console.log('[measure-generation] Simulating timeout scenarios...');
  const scenarios = await runSimulatedScenarios(user.id);

  const baselineStats = normalizeStats(computeStats(baselineSamples));
  const generationStats = normalizeStats(
    computeStats(generationData.syncDurations)
  );
  const attemptStats = normalizeStats(
    computeStats(generationData.attemptDurations)
  );

  const deltaP95 =
    baselineStats && generationStats
      ? round(generationStats.p95 - baselineStats.p95)
      : null;

  const report = {
    generatedAt: new Date().toISOString(),
    iterations,
    baseline: baselineStats,
    generation: {
      sync: generationStats,
      attemptDurations: attemptStats,
    },
    delta: {
      p95Ms: deltaP95,
      meetsBudget: deltaP95 != null ? deltaP95 <= 200 : null,
    },
    scenarios,
  };

  console.log(JSON.stringify(report, null, 2));
}

(async () => {
  try {
    await main();
  } catch (error) {
    console.error('[measure-generation] Performance harness failed:', error);
    process.exitCode = 1;
  } finally {
    if (isClientInitialized()) {
      await client.end();
    }
  }
})();
