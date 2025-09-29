import { performance } from 'node:perf_hooks';

import { describe, expect, it } from 'vitest';

import {
  MODULE_MAX_MINUTES,
  MODULE_MIN_MINUTES,
  TASK_MAX_MINUTES,
  TASK_MIN_MINUTES,
  aggregateNormalizationFlags,
  normalizeModuleMinutes,
  normalizeTaskMinutes,
} from '@/lib/utils/effort';
import { truncateToLength } from '@/lib/utils/truncation';

function percentile(values: number[], fraction: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index =
    Math.ceil(Math.min(Math.max(fraction, 0), 1) * sorted.length) - 1;
  const safeIndex = Math.max(0, Math.min(index, sorted.length - 1));
  return sorted[safeIndex];
}

describe('utils truncation & effort micro-benchmark', () => {
  it('executes common truncation/normalization paths under 5ms p95', () => {
    const warmupIterations = 15;
    const measuredIterations = 200;
    const durations: number[] = [];
    let sink = 0;

    for (
      let iteration = 0;
      iteration < warmupIterations + measuredIterations;
      iteration += 1
    ) {
      const start = performance.now();

      const longTopic = 'a'.repeat(260 + (iteration % 15));
      const shortTopic = 'Topic';
      const longNotes = 'b'.repeat(2300 + (iteration % 33));

      const truncatedLong = truncateToLength(longTopic, 200);
      const truncatedShort = truncateToLength(shortTopic, 200);
      const truncatedNotes = truncateToLength(longNotes, 2000);

      const moduleLow = normalizeModuleMinutes(MODULE_MIN_MINUTES - 25);
      const moduleHigh = normalizeModuleMinutes(MODULE_MAX_MINUTES + 90);
      const moduleNormal = normalizeModuleMinutes(200 + (iteration % 45));

      const taskLow = normalizeTaskMinutes(TASK_MIN_MINUTES - 10);
      const taskHigh = normalizeTaskMinutes(TASK_MAX_MINUTES + 15);
      const taskNormal = normalizeTaskMinutes(45 + (iteration % 25));

      const aggregated = aggregateNormalizationFlags(
        [moduleLow, moduleHigh, moduleNormal],
        [taskLow, taskHigh, taskNormal]
      );

      sink +=
        Number(truncatedLong.originalLength ?? 0) +
        Number(truncatedShort.originalLength ?? 0) +
        Number(truncatedNotes.originalLength ?? 0) +
        (moduleLow.clamped ? 1 : 0) +
        (moduleHigh.clamped ? 1 : 0) +
        (taskLow.clamped ? 1 : 0) +
        (taskHigh.clamped ? 1 : 0) +
        (aggregated.modulesClamped ? 1 : 0) +
        (aggregated.tasksClamped ? 1 : 0);

      const elapsed = performance.now() - start;
      if (iteration >= warmupIterations) {
        durations.push(elapsed);
      }
    }

    // Prevent dead-code elimination (sink is deterministic but ensures work stays in the loop)
    expect(sink).toBeGreaterThan(0);

    const p95 = percentile(durations, 0.95);
    expect(durations).toHaveLength(measuredIterations);
    expect(p95).toBeLessThan(5);
  });
});
