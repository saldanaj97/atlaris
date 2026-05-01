import * as Sentry from '@sentry/nextjs';

import type { AiPlanGenerationProvider } from '@/features/ai/types/provider.types';

export async function generateWithInstrumentation(
  provider: AiPlanGenerationProvider,
  input: Parameters<AiPlanGenerationProvider['generate']>[0],
  options: {
    signal: AbortSignal;
    timeoutMs: number;
  },
): Promise<Awaited<ReturnType<AiPlanGenerationProvider['generate']>>> {
  return Sentry.startSpan(
    {
      op: 'gen_ai.invoke_agent',
      name: 'invoke_agent Plan Generation',
      attributes: {
        'gen_ai.agent.name': 'Plan Generation',
      },
    },
    async (span) => {
      const result = await provider.generate(input, options);
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
