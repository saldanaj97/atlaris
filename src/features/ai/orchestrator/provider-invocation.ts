import type { AiPlanGenerationProvider } from '@/features/ai/types/provider.types';
import type { ProviderMetadata } from '@/shared/types/ai-provider.types';

import * as Sentry from '@sentry/nextjs';

type ProviderResultWithMetadata = {
  metadata: ProviderMetadata;
};

function withProviderInvocationSpan<T extends ProviderResultWithMetadata>(
  agentName: string,
  invoke: () => Promise<T>,
): Promise<T> {
  return Sentry.startSpan(
    {
      op: 'gen_ai.invoke_agent',
      name: `invoke_agent ${agentName}`,
      attributes: {
        'gen_ai.agent.name': agentName,
      },
    },
    async (span) => {
      const result = await invoke();
      const metadata = result.metadata;

      if (metadata.model) {
        span.setAttribute('gen_ai.request.model', metadata.model);
      }
      if (metadata.usage?.promptTokens != null) {
        span.setAttribute(
          'gen_ai.usage.input_tokens',
          metadata.usage.promptTokens,
        );
      }
      if (metadata.usage?.completionTokens != null) {
        span.setAttribute(
          'gen_ai.usage.output_tokens',
          metadata.usage.completionTokens,
        );
      }

      return result;
    },
  );
}

export async function generateWithInstrumentation(
  provider: AiPlanGenerationProvider,
  input: Parameters<AiPlanGenerationProvider['generate']>[0],
  options: {
    signal: AbortSignal;
    timeoutMs: number;
  },
): Promise<Awaited<ReturnType<AiPlanGenerationProvider['generate']>>> {
  return withProviderInvocationSpan('Plan Generation', () =>
    provider.generate(input, options),
  );
}

export async function generateModuleLessonBatchWithInstrumentation(
  provider: Pick<AiPlanGenerationProvider, 'generateModuleLessonBatch'>,
  input: Parameters<AiPlanGenerationProvider['generateModuleLessonBatch']>[0],
  options: {
    signal: AbortSignal;
    timeoutMs: number;
  },
): Promise<
  Awaited<ReturnType<AiPlanGenerationProvider['generateModuleLessonBatch']>>
> {
  return withProviderInvocationSpan('Module Lesson Batch', () =>
    provider.generateModuleLessonBatch(input, options),
  );
}
