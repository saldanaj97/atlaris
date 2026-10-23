/**
 * In-memory stand-in for `@/features/ai/model-catalog/store`, seeded with each
 * tier's guardrail list as probed for DEV-174. Unit setup mocks the store with
 * it and reseeds before every test, so catalog reads never refresh or hit a DB.
 */

import type { GuardrailModel } from '@/features/ai/model-catalog/guardrail-models';
import type { OpenRouterTierModelRow } from '@/features/ai/model-catalog/store';
import type { SubscriptionTier } from '@/shared/types/billing.types';

const PARAMS = ['max_tokens', 'temperature', 'response_format', 'tools'];

function model(
  modelId: string,
  provider: string,
  name: string,
  pricing: { input: number; output: number },
  limits: { contextLength?: number; maxOutputTokens?: number | null } = {},
): GuardrailModel {
  return {
    modelId,
    name,
    provider,
    description: `${name} test fixture.`,
    contextLength: limits.contextLength ?? 1_000_000,
    maxOutputTokens:
      limits.maxOutputTokens === undefined ? 128_000 : limits.maxOutputTokens,
    inputCostPerMillion: pricing.input,
    outputCostPerMillion: pricing.output,
    supportedParameters: PARAMS,
  };
}

const HAIKU = model(
  'anthropic/claude-haiku-5.5',
  'Anthropic',
  'Claude Haiku 5.5',
  {
    input: 0.1,
    output: 0.5,
  },
);
const LUNA = model('openai/gpt-6-luna', 'OpenAI', 'GPT-6 Luna', {
  input: 0.1,
  output: 0.5,
});
const SOL_6_1 = model('openai/gpt-6.1-sol', 'OpenAI', 'GPT-6.1 Sol', {
  input: 2,
  output: 10,
});

export const MODEL_CATALOG_FIXTURE: Readonly<
  Record<SubscriptionTier, readonly GuardrailModel[]>
> = {
  free: [
    model(
      'nvidia/nemotron-3.5-super-vl:free',
      'NVIDIA',
      'Nemotron 3.5 Super VL (free)',
      { input: 0, output: 0 },
      { maxOutputTokens: 131_072 },
    ),
    model(
      'nvidia/nemotron-3.5-lightning:free',
      'NVIDIA',
      'Nemotron 3.5 Lightning (free)',
      { input: 0, output: 0 },
      { maxOutputTokens: 65_536 },
    ),
  ],
  starter: [
    HAIKU,
    LUNA,
    SOL_6_1,
    model(
      'deepseek/deepseek-v4.1-flash',
      'DeepSeek',
      'DeepSeek V4.1 Flash',
      { input: 0.07, output: 0.5 },
      { contextLength: 1_048_576, maxOutputTokens: 943_718 },
    ),
  ],
  pro: [
    HAIKU,
    LUNA,
    SOL_6_1,
    model('openai/gpt-6-sol', 'OpenAI', 'GPT-6 Sol', { input: 2, output: 10 }),
    model('anthropic/claude-sonnet-5.5', 'Anthropic', 'Claude Sonnet 5.5', {
      input: 2,
      output: 10,
    }),
    model('anthropic/claude-opus-5.5', 'Anthropic', 'Claude Opus 5.5', {
      input: 4,
      output: 20,
    }),
  ],
};

let rows: OpenRouterTierModelRow[] = [];

function toRow(
  tier: SubscriptionTier,
  entry: GuardrailModel,
  syncedAt: Date,
): OpenRouterTierModelRow {
  return {
    tier,
    ...entry,
    supportedParameters: [...entry.supportedParameters],
    syncedAt,
  };
}

/** Restores every tier to {@link MODEL_CATALOG_FIXTURE}, synced `syncedAt`. */
export function seedModelCatalogFixture(syncedAt: Date = new Date()): void {
  rows = Object.entries(MODEL_CATALOG_FIXTURE).flatMap(([tier, models]) =>
    models.map((entry) => toRow(tier as SubscriptionTier, entry, syncedAt)),
  );
}

/** Rows as `selectTierModels` would return them. */
export function modelCatalogFixtureRows(
  tier: SubscriptionTier,
): OpenRouterTierModelRow[] {
  return rows
    .filter((row) => row.tier === tier)
    .sort(
      (a, b) =>
        a.inputCostPerMillion - b.inputCostPerMillion ||
        a.outputCostPerMillion - b.outputCostPerMillion ||
        a.name.localeCompare(b.name),
    );
}

export const inMemoryModelCatalogStore = {
  selectTierModels: async (tier: SubscriptionTier) =>
    modelCatalogFixtureRows(tier),
  selectCatalogModel: async (modelId: string) =>
    rows
      .filter((row) => row.modelId === modelId)
      .sort((a, b) => b.syncedAt.getTime() - a.syncedAt.getTime())[0] ?? null,
  replaceTierModels: async (
    tier: SubscriptionTier,
    models: readonly GuardrailModel[],
    syncedAt: Date,
  ) => {
    rows = [
      ...rows.filter((row) => row.tier !== tier),
      ...models.map((entry) => toRow(tier, entry, syncedAt)),
    ];
  },
};
