/**
 * Test-only helper to capture provider inputs for E2E/integration assertions.
 * Only call when appEnv.isTest. Validates env and guards against production.
 * Never use in production paths.
 */
import { appEnv } from '@/lib/config/env';
import { logger } from '@/lib/logging/logger';
import type { AiPlanGenerationProvider, GenerationInput } from './provider';

export type CapturedInput = { provider: string; input: GenerationInput };

declare global {
  // eslint-disable-next-line no-var
  var __capturedInputs: CapturedInput[] | undefined;
}

export function captureForTesting(
  provider: AiPlanGenerationProvider,
  input: GenerationInput
): void {
  try {
    if (!appEnv.isTest) {
      return;
    }
    if (appEnv.isProduction) {
      throw new Error('captureForTesting invoked in production');
    }

    const arr = globalThis.__capturedInputs;
    if (arr) {
      arr.push({
        provider: provider.constructor?.name ?? 'unknown',
        input,
      });
    }
  } catch (error) {
    logger.error(
      { err: error },
      'captureForTesting failed; test assertions may miss captured inputs'
    );
    throw error;
  }
}
