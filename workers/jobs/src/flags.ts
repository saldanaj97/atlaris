import type { FlagEnv } from './env';

import { type FlagEvaluator, setFlagEvaluator } from '@/flags';

/**
 * The Worker's flag source: its Flagship binding (`FLAGS` in
 * `cloudflare.config.ts`), evaluated in-process with no network call. The
 * `environment` attribute is pinned to `WORKER_ENV` so targeting rules mean
 * the same thing here as on the app.
 */
export function createWorkerFlagEvaluator(env: FlagEnv): FlagEvaluator {
  return {
    getBooleanDetails: (key, defaultValue, context) =>
      env.FLAGS.getBooleanDetails(key, defaultValue, {
        ...context,
        environment: env.WORKER_ENV,
      }),
  };
}

let registered: FlagEnv | null = null;

/**
 * Points the shared `@/flags` module at this Worker's binding. Every handler
 * and Workflow `run` calls it next to `parseWorkerEnv`, so the flag helpers
 * in `src/features/**` read Flagship on the Worker exactly as on the app.
 * Re-registering the same binding is a no-op, so the failure cache in
 * `@/flags` survives across invocations of a reused isolate.
 */
export function registerWorkerFlags(env: FlagEnv): void {
  if (
    registered !== null &&
    registered.FLAGS === env.FLAGS &&
    registered.WORKER_ENV === env.WORKER_ENV
  ) {
    return;
  }
  registered = { FLAGS: env.FLAGS, WORKER_ENV: env.WORKER_ENV };
  setFlagEvaluator(createWorkerFlagEvaluator(env));
}
