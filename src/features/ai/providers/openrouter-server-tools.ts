/**
 * OpenRouter server tools (run by OpenRouter, not by us) and their wire shape.
 * Both are billed per use, so a request carrying either must not be retried
 * by the AI Gateway.
 */

export type OpenRouterWebSearchEngine =
  | 'auto'
  | 'native'
  | 'exa'
  | 'firecrawl'
  | 'parallel'
  | 'perplexity';

export type OpenRouterWebSearchTool = {
  type: 'web_search';
  engine?: OpenRouterWebSearchEngine;
  /** Engine-specific; Parallel takes `turbo`, `fast`, `basic` or `advanced`. */
  mode?: string;
  maxResults?: number;
  maxTotalResults?: number;
};

export type OpenRouterAdvisorTool = {
  type: 'advisor';
  model: string;
  instructions?: string;
  maxCompletionTokens?: number;
  temperature?: number;
};

export type OpenRouterServerTool =
  | OpenRouterWebSearchTool
  | OpenRouterAdvisorTool;

export type OpenRouterToolChoice = 'auto' | 'none' | 'required';

type WireServerTool = {
  type: 'openrouter:web_search' | 'openrouter:advisor';
  parameters: Record<string, string | number>;
};

/** Drops unset values so OpenRouter applies its own defaults. */
function definedEntries(
  entries: Record<string, string | number | undefined>,
): Record<string, string | number> {
  const result: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(entries)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}

export function toWireServerTool(tool: OpenRouterServerTool): WireServerTool {
  switch (tool.type) {
    case 'web_search':
      return {
        type: 'openrouter:web_search',
        parameters: definedEntries({
          engine: tool.engine,
          mode: tool.mode,
          max_results: tool.maxResults,
          max_total_results: tool.maxTotalResults,
        }),
      };
    case 'advisor':
      return {
        type: 'openrouter:advisor',
        parameters: definedEntries({
          model: tool.model,
          instructions: tool.instructions,
          max_completion_tokens: tool.maxCompletionTokens,
          temperature: tool.temperature,
        }),
      };
    default: {
      const _never: never = tool;
      throw new Error(`Unhandled server tool: ${JSON.stringify(_never)}`);
    }
  }
}
