import type { AdaptiveTimeoutConfig } from '@/features/ai/types/timeout.types';

const DEFAULT_CONFIG: AdaptiveTimeoutConfig = {
  baseMs: 30_000,
  extensionMs: 15_000,
  extensionThresholdMs: 25_000,
};

/** Default generation timeout in ms. Shared with provider implementations. */
export const DEFAULT_GENERATION_TIMEOUT_MS = DEFAULT_CONFIG.baseMs;

/** Default timeout extension in ms. Shared with provider implementations. */
export const DEFAULT_GENERATION_EXTENSION_MS = DEFAULT_CONFIG.extensionMs;

type AdaptiveTimeoutController = {
  readonly signal: AbortSignal;
  readonly startedAt: number;
  readonly deadline: number;
  readonly didExtend: boolean;
  readonly timedOut: boolean;
  notifyFirstModule(): void;
  cancel(): void;
  elapsed(): number;
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

  let deadline = startedAt + merged.baseMs;
  let didExtend = false;
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const schedule = (delayMs: number) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(
      () => {
        // Node.js executes this callback on the same event loop thread; concurrent
        // writes would require worker threads which we do not spawn here. Should
        // that change, this mutation must be revisited to use an atomic primitive.
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
      deadline = startedAt + totalBudget;
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
    get startedAt() {
      return startedAt;
    },
    get deadline() {
      return deadline;
    },
    get didExtend() {
      return didExtend;
    },
    get timedOut() {
      return timedOut;
    },
    notifyFirstModule,
    cancel,
    elapsed() {
      return now() - startedAt;
    },
  };
}
