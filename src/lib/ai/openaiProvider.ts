import type {
  AiPlanGenerationProvider,
  GenerationInput,
  GenerationOptions,
  ProviderGenerateResult,
} from './provider';
import { ProviderNotImplementedError } from './provider';

export interface OpenAIProviderConfig {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export class OpenAIGenerationProvider implements AiPlanGenerationProvider {
  private readonly apiKey?: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly fetchImpl?: typeof fetch;

  constructor(config: OpenAIProviderConfig = {}) {
    this.apiKey = config.apiKey ?? process.env.OPENAI_API_KEY;
    this.model = config.model ?? 'o4-mini';
    this.baseUrl = config.baseUrl ?? 'https://api.openai.com/v1';
    this.fetchImpl = config.fetchImpl ?? globalThis.fetch;
  }

  generate(
    _input: GenerationInput,
    _options?: GenerationOptions
  ): Promise<ProviderGenerateResult> {
    const apiKey = this.apiKey;
    const fetchImpl = this.fetchImpl;

    if (!apiKey || !fetchImpl) {
      return Promise.reject(
        new ProviderNotImplementedError(
          'OpenAI provider not configured for this environment.'
        )
      );
    }

    return Promise.reject(
      new ProviderNotImplementedError(
        'OpenAI streaming adapter not yet implemented.'
      )
    );
  }
}
