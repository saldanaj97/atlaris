import type { AdaptiveTimeoutConfig } from '@/features/ai/types/timeout.types';

const DEFAULT_CONFIG: AdaptiveTimeoutConfig = {
  baseMs: 30_000,
  extensionMs: 15_000,
  extensionThresholdMs: 25_000,
};

export const DEFAULT_GENERATION_TIMEOUT_MS = DEFAULT_CONFIG.baseMs;

export const DEFAULT_GENERATION_EXTENSION_MS = DEFAULT_CONFIG.extensionMs;

type AdaptiveTimeoutController = {
  readonly signal: AbortSignal;
  readonly didExtend: boolean;
  readonly timedOut: boolean;
  notifyFirstModule(): void;
  cancel(): void;
};

export function createAdaptiveTimeout(
  config: Partial<AdaptiveTimeoutConfig> = {},
): AdaptiveTimeoutController {
  const merged = {
    ...DEFAULT_CONFIG,
    ...config,
  } satisfies AdaptiveTimeoutConfig;
  const now = merged.now ?? Date.now;
  const controller = new AbortController();
  const startedAt = now();

  let didExtend = false;
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const schedule = (delayMs: number) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(
      () => {
        timedOut = true;
        controller.abort();
      },
      Math.max(0, delayMs),
    );
  };

  schedule(merged.baseMs);

  const notifyFirstModule = () => {
    if (didExtend || timedOut) return;
    const elapsed = now() - startedAt;
    if (elapsed <= merged.extensionThresholdMs) {
      didExtend = true;
      const totalBudget = merged.baseMs + merged.extensionMs;
      const remaining = totalBudget - elapsed;
      schedule(remaining);
    }
  };

  const cancel = () => {
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }
  };

  return {
    get signal() {
      return controller.signal;
    },
    get didExtend() {
      return didExtend;
    },
    get timedOut() {
      return timedOut;
    },
    notifyFirstModule,
    cancel,
  };
}
