import { describe, expect, it } from 'vitest';

import {
  getPersistableModelsForTier,
  isPersistableModelId,
  resolveSavedPreferenceForSettings,
} from '@/features/ai/model-preferences';
import type { SubscriptionTier } from '@/features/ai/types/model.types';
import { AI_DEFAULT_MODEL } from '@/shared/constants/ai-models';

describe('model-preferences', () => {
  describe('isPersistableModelId', () => {
    it.each([
      'google/gemini-2.0-flash-exp:free',
      'openai/gpt-oss-20b:free',
      'anthropic/claude-haiku-4.5',
      'anthropic/claude-sonnet-4.5',
    ])('accepts persistable enum-listed id %s', (id) => {
      expect(isPersistableModelId(id)).toBe(true);
    });

    it.each([
      '',
      AI_DEFAULT_MODEL,
      'not-a-real-model',
      'fake/',
      'too/many/parts/here',
      'openai/',
      'gpt-oss-20b:free',
    ])('rejects non-persistable or invalid id %s', (id) => {
      expect(isPersistableModelId(id)).toBe(false);
    });
  });

  describe('getPersistableModelsForTier', () => {
    it('excludes runtime router from free tier and includes a free-tier saveable model', () => {
      const freeModels = getPersistableModelsForTier('free');
      expect(freeModels.some((m) => m.id === 'openrouter/free')).toBe(false);
      expect(freeModels.some((m) => m.id === 'openai/gpt-oss-20b:free')).toBe(
        true
      );
    });

    it('starter tier matches free-tier filtering for persistable models', () => {
      const freeModels = getPersistableModelsForTier('free');
      const starterModels = getPersistableModelsForTier('starter');
      expect(starterModels.map((m) => m.id).sort()).toEqual(
        freeModels.map((m) => m.id).sort()
      );
    });

    it('pro tier includes persistable pro-catalog models not in free-tier list', () => {
      const freeModels = getPersistableModelsForTier('free');
      const proModels = getPersistableModelsForTier('pro');
      const freeIds = new Set(freeModels.map((m) => m.id));
      const proOnly = proModels.filter((m) => !freeIds.has(m.id));
      expect(proOnly.length).toBeGreaterThan(0);
      expect(proOnly.some((m) => m.id === 'anthropic/claude-sonnet-4.5')).toBe(
        true
      );
    });
  });

  describe('resolveSavedPreferenceForSettings', () => {
    it.each<[SubscriptionTier, string | null | undefined, string | null]>([
      ['free', null, null],
      ['free', undefined, null],
      ['free', '', null],
      ['free', 'anthropic/claude-haiku-4.5', 'anthropic/claude-haiku-4.5'],
      ['free', 'anthropic/claude-sonnet-4.5', null],
      ['free', AI_DEFAULT_MODEL, null],
      ['free', 'not-a-real-model', null],
      ['pro', 'anthropic/claude-sonnet-4.5', 'anthropic/claude-sonnet-4.5'],
      ['starter', 'anthropic/claude-sonnet-4.5', null],
      ['starter', 'anthropic/claude-haiku-4.5', 'anthropic/claude-haiku-4.5'],
    ])('tier %s with stored %j returns %j', (tier, stored, expected) => {
      expect(resolveSavedPreferenceForSettings(tier, stored)).toBe(expected);
    });
  });
});
