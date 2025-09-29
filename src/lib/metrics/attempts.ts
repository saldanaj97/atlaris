import type { GenerationAttemptRecord } from '@/lib/db/queries/attempts';
import type { FailureClassification } from '@/lib/types/client';

export interface MetricStatsSnapshot {
  count: number;
  sum: number;
  min: number | null;
  max: number | null;
  last: number | null;
  average: number | null;
}

export interface AttemptMetricsSnapshot {
  totalAttempts: number;
  success: {
    count: number;
    duration: MetricStatsSnapshot;
    modules: MetricStatsSnapshot;
    tasks: MetricStatsSnapshot;
  };
  failure: {
    count: number;
    duration: MetricStatsSnapshot;
    classifications: Record<FailureClassification, number>;
  };
}

interface MetricStatsState {
  count: number;
  sum: number;
  min: number | null;
  max: number | null;
  last: number | null;
}

interface AttemptMetricsState {
  totalAttempts: number;
  success: {
    count: number;
    duration: MetricStatsState;
    modules: MetricStatsState;
    tasks: MetricStatsState;
  };
  failure: {
    count: number;
    duration: MetricStatsState;
    classifications: Record<FailureClassification, number>;
  };
}

const FAILURE_KEYS: FailureClassification[] = [
  'validation',
  'provider_error',
  'rate_limit',
  'timeout',
  'capped',
];

function createStatsState(): MetricStatsState {
  return {
    count: 0,
    sum: 0,
    min: null,
    max: null,
    last: null,
  };
}

function createFailureMap(): Record<FailureClassification, number> {
  return FAILURE_KEYS.reduce<Record<FailureClassification, number>>(
    (acc, key) => {
      acc[key] = 0;
      return acc;
    },
    {} as Record<FailureClassification, number>
  );
}

let state: AttemptMetricsState = {
  totalAttempts: 0,
  success: {
    count: 0,
    duration: createStatsState(),
    modules: createStatsState(),
    tasks: createStatsState(),
  },
  failure: {
    count: 0,
    duration: createStatsState(),
    classifications: createFailureMap(),
  },
};

function toSnapshot(stats: MetricStatsState): MetricStatsSnapshot {
  return {
    count: stats.count,
    sum: stats.sum,
    min: stats.min,
    max: stats.max,
    last: stats.last,
    average: stats.count > 0 ? stats.sum / stats.count : null,
  };
}

function updateStats(stats: MetricStatsState, value: number): void {
  const normalized = Number.isFinite(value) ? Math.max(0, value) : 0;
  stats.count += 1;
  stats.sum += normalized;
  stats.last = normalized;
  stats.min = stats.min === null ? normalized : Math.min(stats.min, normalized);
  stats.max = stats.max === null ? normalized : Math.max(stats.max, normalized);
}

function extractNumeric(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function extractDuration(attempt: GenerationAttemptRecord): number {
  let metadataDuration: number | null = null;

  const metadata = attempt.metadata;
  if (metadata && typeof metadata === 'object' && 'timing' in metadata) {
    const timing = (metadata as { timing?: { duration_ms?: unknown } }).timing;
    if (timing && typeof timing === 'object') {
      metadataDuration = extractNumeric(
        (timing as { duration_ms?: unknown }).duration_ms
      );
    }
  }

  const attemptDuration = extractNumeric(attempt.durationMs);

  if (metadataDuration && metadataDuration > 0) {
    return metadataDuration;
  }

  if (attemptDuration && attemptDuration > 0) {
    return attemptDuration;
  }

  return metadataDuration ?? attemptDuration ?? 0;
}

function sanitizeClassification(
  classification: GenerationAttemptRecord['classification']
): FailureClassification | null {
  if (!classification) return null;
  if (FAILURE_KEYS.includes(classification as FailureClassification)) {
    return classification as FailureClassification;
  }
  return null;
}

export function recordAttemptSuccess(attempt: GenerationAttemptRecord): void {
  const duration = extractDuration(attempt);
  const modulesCount = Math.max(0, Number(attempt.modulesCount ?? 0));
  const tasksCount = Math.max(0, Number(attempt.tasksCount ?? 0));

  state.totalAttempts += 1;
  state.success.count += 1;
  updateStats(state.success.duration, duration);
  updateStats(state.success.modules, modulesCount);
  updateStats(state.success.tasks, tasksCount);
}

export function recordAttemptFailure(attempt: GenerationAttemptRecord): void {
  const duration = extractDuration(attempt);
  const classification = sanitizeClassification(attempt.classification);

  state.totalAttempts += 1;
  state.failure.count += 1;
  updateStats(state.failure.duration, duration);

  if (classification) {
    state.failure.classifications[classification] += 1;
  }
}

export function getAttemptMetricsSnapshot(): AttemptMetricsSnapshot {
  return {
    totalAttempts: state.totalAttempts,
    success: {
      count: state.success.count,
      duration: toSnapshot(state.success.duration),
      modules: toSnapshot(state.success.modules),
      tasks: toSnapshot(state.success.tasks),
    },
    failure: {
      count: state.failure.count,
      duration: toSnapshot(state.failure.duration),
      classifications: { ...state.failure.classifications },
    },
  };
}

export function resetAttemptMetrics(): void {
  state = {
    totalAttempts: 0,
    success: {
      count: 0,
      duration: createStatsState(),
      modules: createStatsState(),
      tasks: createStatsState(),
    },
    failure: {
      count: 0,
      duration: createStatsState(),
      classifications: createFailureMap(),
    },
  };
}
