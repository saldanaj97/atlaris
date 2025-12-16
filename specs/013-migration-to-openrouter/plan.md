# Migration Plan: Full OpenRouter with User-Selectable Models

## Overview

This plan migrates from the current Google AI primary + OpenRouter fallback setup to a **fully OpenRouter-based system** with user-selectable models. The migration removes the `AI_ENABLE_OPENROUTER` flag dependency and always uses OpenRouter.

### Current Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│ POST /api/v1/plans/stream                                               │
│ (src/app/api/v1/plans/stream/route.ts)                                  │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ getGenerationProvider() → RouterGenerationProvider                      │
│ (provider-factory.ts)                                                   │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ RouterGenerationProvider.generate()                                     │
│ (providers/router.ts)                                                   │
│ - Tries OpenRouter (if AI_ENABLE_OPENROUTER=true) → GoogleAI (fallback) │
│ - Each provider has 1 retry via p-retry                                 │
└─────────────────────────────────────────────────────────────────────────┘
```

### Target Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│ POST /api/v1/plans/stream                                               │
│ (src/app/api/v1/plans/stream/route.ts)                                  │
│ - Reads user's preferredAiModel (future: from DB)                       │
│ - Validates model against tier                                          │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ getGenerationProviderWithModel(modelId)                                 │
│ (provider-factory.ts)                                                   │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ RouterGenerationProvider.generate()                                     │
│ (providers/router.ts)                                                   │
│ - OpenRouter ONLY with user-selected model                              │
│ - No Google AI fallback (deprecated)                                    │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Create Model Configuration System

### 1.1 Create new file: `src/lib/ai/models.ts`

**Purpose**: Define all available OpenRouter models with metadata for UI display and tier-gating.

**Functions/Constants to create**:

```typescript
// Constants
export const DEFAULT_MODEL = 'google/gemini-1.5-flash';

// Types
export interface AvailableModel {
  id: string;              // OpenRouter model ID (e.g., 'google/gemini-1.5-flash')
  name: string;            // Display name (e.g., 'Gemini 1.5 Flash')
  provider: string;        // Provider name (e.g., 'Google')
  description: string;     // Short description for UI
  tier: 'free' | 'pro';    // Required subscription tier
  contextWindow: number;   // Context window size
  maxOutputTokens: number; // Max output tokens
}

export const AVAILABLE_MODELS: AvailableModel[] = [...]

// Helper functions
export function getModelById(id: string): AvailableModel | undefined
export function getModelsForTier(tier: 'free' | 'starter' | 'pro'): AvailableModel[]
export function isValidModelId(id: string): boolean
```

**Initial Model List**:

| Model ID                                   | Name                        | Provider  | Tier | Context Window | Cost (input) | Cost (output) |
| ------------------------------------------ | --------------------------- | --------- | ---- | -------------- | ------------ | ------------- |
| `google/gemini-2.0-flash-exp:free`         | Gemini 2.0 Flash            | Google    | free | 1.05M tokens   | $0/M         | $0/M          |
| `openai/gpt-oss-20b:free`                  | gpt-oss-20b                 | OpenAI    | free | 131K tokens    | $0/M         | $0/M          |
| `alibaba/tongyi-deepresearch-30b-a3b:free` | Tongyi DeepResearch 30B A3B | Alibaba   | free | 131K tokens    | $0/M         | $0/M          |
| `anthropic/claude-haiku-4.5`               | Claude Haiku 4.5            | Anthropic | free | 200K tokens    | $1/M         | $5/M          |
| `google/gemini-2.5-flash-lite`             | Gemini 2.5 Flash Lite       | Google    | pro  | 1.05M tokens   | TBD          | TBD           |
| `google/gemini-3-pro-preview`              | Gemini 3 Pro Preview        | Google    | pro  | 1.05M tokens   | TBD          | TBD           |
| `anthropic/claude-sonnet-4.5`              | Claude Sonnet 4.5           | Anthropic | pro  | 1M tokens      | $3/M         | $15/M         |
| `openai/gpt-4o-mini-2024-07-18`            | GPT-4o-mini 2024-07-18      | OpenAI    | pro  | 128K tokens    | $0.15/M      | $0.60/M       |
| `openai/gpt-4o-mini-search-preview`        | GPT-4o-mini Search Preview  | OpenAI    | pro  | 128K tokens    | TBD          | TBD           |
| `openai/gpt-4o-2024-05-13`                 | GPT-4o 2024-05-13           | OpenAI    | pro  | 128K tokens    | TBD          | TBD           |
| `openai/gpt-5.1`                           | GPT-5.1                     | OpenAI    | pro  | 400K tokens    | TBD          | TBD           |
| `openai/gpt-5.2`                           | GPT-5.2                     | OpenAI    | pro  | 400K tokens    | $1.75/M      | $14/M         |

### Tests

#### Unit

1. **`getModelById` returns correct model**
   - Call `getModelById()` with a valid model ID from `AVAILABLE_MODELS`
   - Returns the matching `AvailableModel` object with correct properties

2. **`getModelById` returns undefined for invalid ID**
   - Call `getModelById()` with a non-existent model ID
   - Returns `undefined`

3. **`getModelsForTier` filters free tier correctly**
   - Call `getModelsForTier('free')`
   - Returns only models where `tier === 'free'`

4. **`getModelsForTier` returns all models for pro tier**
   - Call `getModelsForTier('pro')`
   - Returns all models (both free and pro tier models are accessible to pro users)

5. **`getModelsForTier` starter tier gets same access as free**
   - Call `getModelsForTier('starter')`
   - Returns only free-tier models (starter doesn't unlock pro models)

6. **`isValidModelId` returns true for valid IDs**
   - Call `isValidModelId()` with each model ID in `AVAILABLE_MODELS`
   - Returns `true` for all valid model IDs

7. **`isValidModelId` returns false for invalid IDs**
   - Call `isValidModelId()` with arbitrary strings, empty string, and null-ish values
   - Returns `false` for all invalid inputs

8. **`DEFAULT_MODEL` is a valid model ID**
   - Verify `DEFAULT_MODEL` constant exists in `AVAILABLE_MODELS`
   - `isValidModelId(DEFAULT_MODEL)` returns `true`

9. **`AVAILABLE_MODELS` has required properties**
   - Each model in `AVAILABLE_MODELS` has all required fields (`id`, `name`, `provider`, `description`, `tier`, `contextWindow`, `maxOutputTokens`)
   - All field types are correct (strings for text, numbers for numeric values)

---

## Phase 2: Refactor AI Provider System

### 2.1 Modify: `src/lib/config/env.ts`

**Changes**:

1. **Remove** `enableOpenRouter` getter from `aiEnv` (lines ~283-285)
2. **Add** `defaultModel` getter to `aiEnv`:
   ```typescript
   get defaultModel() {
     return getServerOptional('AI_DEFAULT_MODEL') ?? 'google/gemini-1.5-flash';
   }
   ```
3. **Mark deprecated** (add JSDoc comment) the `deterministicOverflowModel` and `primaryModel` fields

**Location**: Lines ~275-290

---

### 2.2 Modify: `src/lib/ai/providers/openrouter.ts`

**Changes**:

1. **Make `model` required** in `OpenRouterProviderConfig`:

   ```typescript
   export interface OpenRouterProviderConfig {
     model: string; // REQUIRED - OpenRouter model ID
     apiKey?: string;
     // ... rest unchanged
   }
   ```

2. **Remove default model fallback** in constructor:

   ```typescript
   // Before: this.model = cfg.model ?? 'openai/gpt-4o';
   // After:
   if (!cfg.model) {
     throw new Error('OpenRouterProvider requires a model to be specified');
   }
   this.model = cfg.model;
   ```

3. **Update existing TODO comments** to reference the new model selection system

**Location**: Lines ~22-53

---

### 2.3 Modify: `src/lib/ai/providers/router.ts`

**Changes**:

1. **Update `RouterConfig` interface**:

   ```typescript
   export interface RouterConfig {
     useMock?: boolean;
     model?: string; // NEW: User-selected model ID
     // REMOVE: enableOpenRouter (no longer needed)
   }
   ```

2. **Remove Google AI fallback chain** - OpenRouter becomes the only real provider

3. **Remove `enableOpenRouter` check** (lines 27-30)

4. **Update constructor logic**:

   ```typescript
   constructor(cfg: RouterConfig = {}) {
     const useMock = cfg.useMock ?? (aiEnv.useMock === 'true' && !appEnv.isProduction);

     if (useMock) {
       this.providers = [() => new MockGenerationProvider()];
       return;
     }

     // OpenRouter is now the only provider
     const model = cfg.model ?? aiEnv.defaultModel ?? DEFAULT_MODEL;
     this.providers = [
       () => new OpenRouterProvider({ model })
     ];

     // TODO: Add Google AI as emergency fallback only if OpenRouter is completely down
     // For now, we rely on OpenRouter's internal model routing and fallbacks
   }
   ```

5. **Remove Google AI import** (can keep file for emergency rollback)

**Location**: Lines ~1-55

### Tests

#### Unit

1. **`aiEnv.defaultModel` returns configured value**
   - Set `AI_DEFAULT_MODEL` env var to a specific model ID
   - `aiEnv.defaultModel` returns the configured value

2. **`aiEnv.defaultModel` returns fallback when not set**
   - Ensure `AI_DEFAULT_MODEL` env var is not set
   - `aiEnv.defaultModel` returns `'google/gemini-1.5-flash'`

3. **`enableOpenRouter` getter is removed**
   - Access `aiEnv` object
   - Property `enableOpenRouter` does not exist

4. **OpenRouterProvider throws when model not provided**
   - Instantiate `OpenRouterProvider` without `model` in config
   - Throws error with message "OpenRouterProvider requires a model to be specified"

5. **OpenRouterProvider uses provided model**
   - Instantiate `OpenRouterProvider` with `{ model: 'test/model' }`
   - Provider's internal model property is set to `'test/model'`

6. **RouterGenerationProvider creates OpenRouter with correct model**
   - Instantiate `RouterGenerationProvider` with `{ model: 'google/gemini-2.0-flash-exp:free' }`
   - Internal provider chain contains OpenRouterProvider configured with that model

7. **RouterGenerationProvider uses default model when none provided**
   - Instantiate `RouterGenerationProvider` without model config
   - Provider uses `DEFAULT_MODEL` from models.ts

8. **RouterGenerationProvider respects mock settings in test env**
   - Set test environment with `AI_USE_MOCK=true`
   - Provider chain contains `MockGenerationProvider` instead of OpenRouter

9. **RouterGenerationProvider does not include Google AI fallback**
   - Instantiate `RouterGenerationProvider` in non-mock mode
   - Provider chain only contains OpenRouter, no Google AI provider

10. **`getGenerationProviderWithModel` creates provider with specified model**
    - Call `getGenerationProviderWithModel('anthropic/claude-haiku-4.5')`
    - Returns `RouterGenerationProvider` configured with that model

11. **`getGenerationProviderWithModel` respects mock in test environment**
    - Set test environment with mock enabled
    - Returns `MockGenerationProvider` regardless of model parameter

12. **`getGenerationProvider` uses default model**
    - Call `getGenerationProvider()` without arguments
    - Returns provider configured with `aiEnv.defaultModel` or `DEFAULT_MODEL`

#### Integration

1. **OpenRouter provider makes API call with correct model**
   - Configure OpenRouterProvider with a specific model and make a generation request
   - OpenRouter API receives request with correct model in payload

2. **Router provider fallback behavior (future emergency fallback)**
   - Simulate OpenRouter failure with emergency fallback enabled
   - Provider gracefully handles failure (logs error, returns appropriate error state)

---

### 2.4 Modify: `src/lib/ai/provider-factory.ts`

**Changes**:

1. **Add new function** `getGenerationProviderWithModel(modelId: string)`:

   ```typescript
   /**
    * Creates a generation provider configured with a specific model.
    * Used when user has selected a preferred model.
    *
    * @param modelId - OpenRouter model ID (e.g., 'google/gemini-1.5-flash')
    */
   export function getGenerationProviderWithModel(
     modelId: string
   ): AiPlanGenerationProvider {
     // In test environment, still respect mock settings
     if (appEnv.isTest) {
       const providerType = aiEnv.provider;
       if (providerType === 'mock' || aiEnv.useMock !== 'false') {
         return new MockGenerationProvider({
           deterministicSeed:
             typeof aiEnv.mockSeed === 'number' ? aiEnv.mockSeed : undefined,
         });
       }
     }

     // TODO: Validate modelId against AVAILABLE_MODELS and user's tier
     // For now, pass through to RouterGenerationProvider
     return new RouterGenerationProvider({ model: modelId });
   }
   ```

2. **Update existing `getGenerationProvider()`** to use default model:

   ```typescript
   export function getGenerationProvider(): AiPlanGenerationProvider {
     // ... existing mock/test logic ...

     // Default to router with default model
     return new RouterGenerationProvider({
       model: aiEnv.defaultModel ?? DEFAULT_MODEL,
     });
   }
   ```

3. **Add import** for `DEFAULT_MODEL` from `./models`

**Location**: Lines ~1-55 (entire file restructure)

---

## Phase 3: Add User Preference Support (Database Layer)

### 3.1 Modify: `src/lib/db/schema/tables/users.ts`

**Changes**:

Add TODO comment for future schema migration:

```typescript
// TODO: [OPENROUTER-MIGRATION] Add preferredAiModel column in future migration:
// preferredAiModel: text('preferred_ai_model'), // e.g., 'google/gemini-1.5-flash'
// This will store the user's selected AI model from AVAILABLE_MODELS
```

**Location**: After line ~30 (after `monthlyExportCount`)

---

### 3.2 Modify: `src/lib/db/queries/users.ts`

**Changes**:

Add TODO comment for future query function:

```typescript
// TODO: [OPENROUTER-MIGRATION] Add function when preferredAiModel column exists:
// export async function updateUserModelPreference(
//   userId: string,
//   modelId: string
// ): Promise<void>

// TODO: [OPENROUTER-MIGRATION] Add function to get user's preferred model:
// export async function getUserPreferredModel(userId: string): Promise<string | null>
```

### Tests

#### Unit

1. **TODO comments are present in users.ts schema**
   - Read `src/lib/db/schema/tables/users.ts` file content
   - Contains `[OPENROUTER-MIGRATION]` TODO comment for `preferredAiModel` column

2. **TODO comments are present in users.ts queries**
   - Read `src/lib/db/queries/users.ts` file content
   - Contains `[OPENROUTER-MIGRATION]` TODO comments for `updateUserModelPreference` and `getUserPreferredModel`

_Note: Phase 3 is primarily documentation/TODO placeholders. Full tests will be added when the database schema migration is implemented._

---

## Phase 4: Update API Layer

### 4.1 Modify: `src/app/api/v1/plans/stream/route.ts`

**Changes**:

1. **Add import** for model utilities:

   ```typescript
   import { DEFAULT_MODEL, isValidModelId } from '@/lib/ai/models';
   import { getGenerationProviderWithModel } from '@/lib/ai/provider-factory';
   ```

2. **Update provider selection** (around line 129):

   ```typescript
   // TODO: [OPENROUTER-MIGRATION] Once preferredAiModel column exists:
   // const userPreferredModel = user.preferredAiModel;

   // TODO: [OPENROUTER-MIGRATION] Implement tier-gating:
   // const allowedModels = getModelsForTier(userTier);
   // const model = userPreferredModel && allowedModels.some(m => m.id === userPreferredModel)
   //   ? userPreferredModel
   //   : DEFAULT_MODEL;

   // For now, use default model until user preferences are implemented
   const model = DEFAULT_MODEL;
   const provider = getGenerationProviderWithModel(model);
   ```

3. **Add optional model override** via query param (for testing/future use):
   ```typescript
   // Allow explicit model override via query param (useful for testing)
   const url = new URL(req.url);
   const modelOverride = url.searchParams.get('model');
   const model =
     modelOverride && isValidModelId(modelOverride)
       ? modelOverride
       : DEFAULT_MODEL;
   ```

**Location**: Lines ~127-135

---

### 4.2 Create new file: `src/app/api/v1/user/preferences/route.ts`

**Purpose**: API endpoint for getting/updating user preferences (model selection).

**Contents**:

```typescript
import { z } from 'zod';

import { AVAILABLE_MODELS, isValidModelId } from '@/lib/ai/models';
import { withAuth, withErrorBoundary } from '@/lib/api/auth';
import { ValidationError } from '@/lib/api/errors';
import { jsonSuccess } from '@/lib/api/response';
import { getUserByClerkId } from '@/lib/db/queries/users';

const updatePreferencesSchema = z.object({
  preferredAiModel: z.string().refine(isValidModelId, {
    message: 'Invalid model ID',
  }),
});

// GET /api/v1/user/preferences
export const GET = withErrorBoundary(
  withAuth(async ({ userId }) => {
    const user = await getUserByClerkId(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // TODO: [OPENROUTER-MIGRATION] Return actual user preferences when column exists:
    // return jsonSuccess({ preferredAiModel: user.preferredAiModel ?? DEFAULT_MODEL });

    return jsonSuccess({
      preferredAiModel: null, // Not yet implemented
      availableModels: AVAILABLE_MODELS,
    });
  })
);

// PATCH /api/v1/user/preferences
export const PATCH = withErrorBoundary(
  withAuth(async ({ req, userId }) => {
    const body = await req.json();
    const parsed = updatePreferencesSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError('Invalid preferences', parsed.error.flatten());
    }

    const user = await getUserByClerkId(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // TODO: [OPENROUTER-MIGRATION] Implement tier-gating check:
    // const userTier = await resolveUserTier(user.id);
    // const model = getModelById(parsed.data.preferredAiModel);
    // if (model && model.tier === 'pro' && userTier === 'free') {
    //   throw new ValidationError('Model requires Pro subscription');
    // }

    // TODO: [OPENROUTER-MIGRATION] Save preference when column exists:
    // await updateUserModelPreference(user.id, parsed.data.preferredAiModel);

    return jsonSuccess({
      message: 'Preferences updated',
      // TODO: Return actual saved preference
    });
  })
);
```

### Tests

#### Unit

1. **`isValidModelId` import works in route**
   - Import `isValidModelId` from `@/lib/ai/models` in route file
   - Function is callable and validates model IDs correctly

2. **Model override query param parsing**
   - Parse URL with `?model=google/gemini-2.0-flash-exp:free` query param
   - Extracts model ID correctly from search params

3. **Invalid model override falls back to default**
   - Parse URL with `?model=invalid/model-id` query param
   - Falls back to `DEFAULT_MODEL` when `isValidModelId` returns false

4. **Preferences schema validates model ID**
   - Parse valid `{ preferredAiModel: 'google/gemini-2.0-flash-exp:free' }` with Zod schema
   - Validation passes

5. **Preferences schema rejects invalid model ID**
   - Parse invalid `{ preferredAiModel: 'not-a-real-model' }` with Zod schema
   - Validation fails with "Invalid model ID" message

#### Integration

1. **Plan stream uses default model**
   - POST to `/api/v1/plans/stream` without model param (authenticated)
   - Plan generation uses `DEFAULT_MODEL`

2. **Plan stream accepts model override**
   - POST to `/api/v1/plans/stream?model=google/gemini-2.0-flash-exp:free` (authenticated)
   - Plan generation uses the specified model

3. **Plan stream rejects invalid model override**
   - POST to `/api/v1/plans/stream?model=invalid/model` (authenticated)
   - Falls back to `DEFAULT_MODEL` (does not error)

4. **GET preferences returns available models**
   - GET `/api/v1/user/preferences` (authenticated)
   - Response contains `availableModels` array with all `AVAILABLE_MODELS`

5. **GET preferences returns null for unset preference**
   - GET `/api/v1/user/preferences` (authenticated, no preference set)
   - Response contains `preferredAiModel: null`

6. **PATCH preferences validates model ID**
   - PATCH `/api/v1/user/preferences` with `{ preferredAiModel: 'invalid' }` (authenticated)
   - Returns 400 with validation error

7. **PATCH preferences accepts valid model**
   - PATCH `/api/v1/user/preferences` with `{ preferredAiModel: 'google/gemini-2.0-flash-exp:free' }` (authenticated)
   - Returns success response

8. **Preferences endpoints require authentication**
   - GET/PATCH `/api/v1/user/preferences` without auth token
   - Returns 401 Unauthorized

#### E2E

1. **Full plan generation with model selection**
   - Authenticate user, set model preference, generate plan
   - Plan is generated using the selected model

---

## Phase 5: Update UI Layer

### 5.1 Create new file: `src/components/settings/model-selector.tsx`

**Purpose**: UI component for selecting AI model preference.

**Key elements**:

- Display available models with name, provider, description
- Show tier badge (Free/Pro) for each model
- Disable Pro models for free users (with upgrade CTA)
- Save button that calls PATCH `/api/v1/user/preferences`

```typescript
'use client';

import { useState } from 'react';
// ... imports

interface ModelSelectorProps {
  currentModel: string | null;
  userTier: 'free' | 'starter' | 'pro';
}

export function ModelSelector({ currentModel, userTier }: ModelSelectorProps) {
  // TODO: [OPENROUTER-MIGRATION] Implement tier-gating in UI:
  // const availableModels = useMemo(() =>
  //   AVAILABLE_MODELS.filter(m =>
  //     m.tier === 'free' || userTier === 'pro' || userTier === 'starter'
  //   ),
  //   [userTier]
  // );
  // Component implementation...
}
```

---

### 5.2 Modify: `src/app/settings/page.tsx` (or create `src/app/settings/ai/page.tsx`)

**Changes**:

Add "AI Preferences" section with `ModelSelector` component:

```typescript
import { ModelSelector } from '@/components/settings/model-selector';

// In the settings page JSX:
<section>
  <h2>AI Preferences</h2>
  <p>Choose your preferred AI model for generating learning plans.</p>
  <ModelSelector
    currentModel={userPreferences?.preferredAiModel ?? null}
    userTier={userTier}
  />
</section>
```

### Tests

#### Unit

1. **ModelSelector renders with no current model**
   - Render `<ModelSelector currentModel={null} userTier="free" />`
   - Component renders without errors, no model pre-selected

2. **ModelSelector renders with current model selected**
   - Render `<ModelSelector currentModel="google/gemini-2.0-flash-exp:free" userTier="free" />`
   - Specified model is shown as selected

3. **ModelSelector displays all available models**
   - Render `<ModelSelector currentModel={null} userTier="pro" />`
   - All models from `AVAILABLE_MODELS` are displayed

4. **ModelSelector shows tier badges**
   - Render component with models list
   - Each model displays correct "Free" or "Pro" badge

5. **ModelSelector disables pro models for free users**
   - Render `<ModelSelector currentModel={null} userTier="free" />`
   - Pro-tier models are disabled/non-selectable

6. **ModelSelector enables all models for pro users**
   - Render `<ModelSelector currentModel={null} userTier="pro" />`
   - All models (free and pro) are selectable

7. **ModelSelector shows upgrade CTA for locked models**
   - Render with `userTier="free"` and click on a pro model
   - Shows upgrade prompt or CTA

8. **ModelSelector calls save handler on selection**
   - Render component and select a different model
   - Save/update handler is called with new model ID

9. **Settings page renders AI Preferences section**
   - Render settings page component
   - "AI Preferences" section heading is present

10. **Settings page passes correct props to ModelSelector**
    - Render settings page with user tier and preferences
    - ModelSelector receives `currentModel` and `userTier` props

#### Integration

1. **ModelSelector saves preference via API**
   - Select a model in ModelSelector component
   - PATCH request is made to `/api/v1/user/preferences`

2. **ModelSelector handles API errors gracefully**
   - Mock API to return error on preference save
   - Error toast/message is displayed to user

3. **Settings page fetches current preferences**
   - Load settings page
   - GET request to `/api/v1/user/preferences` is made on mount

#### E2E

1. **User selects and saves model preference**
   - Navigate to settings, select a model, save
   - Preference is persisted and shown on page refresh

2. **Free user cannot select pro models**
   - Login as free user, navigate to settings
   - Pro models are visually disabled with upgrade prompt

3. **Pro user can select any model**
   - Login as pro user, navigate to settings
   - Can select and save any model including pro-tier

---

## Phase 6: Update Usage Tracking

### 6.1 Modify: `src/lib/db/schema/tables/usage.ts`

**Changes**:

Add TODO for cost tracking enhancement:

```typescript
// TODO: [OPENROUTER-MIGRATION] Consider adding these fields for better cost tracking:
// estimatedCostCents: integer('estimated_cost_cents'), // OpenRouter provides cost data
// modelPricingSnapshot: jsonb('model_pricing_snapshot'), // Cache pricing at request time
```

### Tests

#### Unit

1. **TODO comments are present in usage.ts**
   - Read `src/lib/db/schema/tables/usage.ts` file content
   - Contains `[OPENROUTER-MIGRATION]` TODO comment for cost tracking fields

2. **Existing usage tracking still works**
   - Call existing usage tracking functions
   - Functions execute without errors (no breaking changes)

_Note: Phase 6 is primarily documentation/TODO placeholders. Full cost tracking tests will be added when the schema migration is implemented._

---

## Phase 7: Cleanup and Deprecation

### 7.1 Files to mark as deprecated (keep for emergency rollback)

| File                             | Action                                                          |
| -------------------------------- | --------------------------------------------------------------- |
| `src/lib/ai/providers/google.ts` | Add deprecation comment at top, keep for 30-day rollback period |

### 7.2 Environment variables to deprecate

| Variable               | Current Usage             | Action                                          |
| ---------------------- | ------------------------- | ----------------------------------------------- |
| `AI_ENABLE_OPENROUTER` | Controls OpenRouter usage | **Remove** - no longer checked                  |
| `AI_PRIMARY`           | Sets primary model        | Mark deprecated, replaced by `AI_DEFAULT_MODEL` |
| `AI_FALLBACK`          | Sets fallback model       | Mark deprecated, no longer needed               |
| `AI_OVERFLOW`          | Sets overflow model       | Mark deprecated, replaced by user selection     |

### 7.3 New environment variables

| Variable           | Purpose                     | Default                   |
| ------------------ | --------------------------- | ------------------------- |
| `AI_DEFAULT_MODEL` | Default model for new users | `google/gemini-1.5-flash` |

### Tests

#### Unit

1. **Google AI provider has deprecation comment**
   - Read `src/lib/ai/providers/google.ts` file content
   - File starts with `@deprecated` JSDoc comment

2. **`AI_ENABLE_OPENROUTER` is no longer read**
   - Search codebase for `AI_ENABLE_OPENROUTER` or `enableOpenRouter`
   - No active code references (only in deprecated/comment sections)

3. **`AI_PRIMARY` is marked deprecated in env.ts**
   - Read `src/lib/config/env.ts` file content
   - `primaryModel` getter has `@deprecated` JSDoc comment

4. **`AI_FALLBACK` is marked deprecated in env.ts**
   - Read `src/lib/config/env.ts` file content
   - Fallback-related getters have `@deprecated` JSDoc comment

5. **`AI_DEFAULT_MODEL` env var is documented**
   - Check env.ts for `AI_DEFAULT_MODEL` getter
   - Getter exists with proper JSDoc documentation

#### Integration

1. **System works without deprecated env vars**
   - Remove `AI_ENABLE_OPENROUTER`, `AI_PRIMARY`, `AI_FALLBACK` from test env
   - Plan generation still works using `AI_DEFAULT_MODEL`

2. **System works with only `AI_DEFAULT_MODEL`**
   - Set only `AI_DEFAULT_MODEL` in environment
   - Plan generation uses the specified default model

#### Regression

1. **Existing plan generation flow unchanged**
   - Generate a plan using the standard flow
   - Plan is created successfully with correct structure

2. **Usage tracking captures model information**
   - Generate a plan with a specific model
   - Usage record includes the model used

3. **Error handling preserved**
   - Simulate provider failure
   - Appropriate error response returned to client

---

## Implementation Order

| Step | Files                                               | Priority | Dependencies | Estimated Effort |
| ---- | --------------------------------------------------- | -------- | ------------ | ---------------- |
| 1    | Create `src/lib/ai/models.ts`                       | HIGH     | None         | 1 hour           |
| 2    | Modify `src/lib/config/env.ts`                      | HIGH     | Step 1       | 30 min           |
| 3    | Modify `src/lib/ai/providers/openrouter.ts`         | HIGH     | None         | 30 min           |
| 4    | Modify `src/lib/ai/providers/router.ts`             | HIGH     | Steps 1, 3   | 1 hour           |
| 5    | Modify `src/lib/ai/provider-factory.ts`             | HIGH     | Steps 1, 4   | 30 min           |
| 6    | Modify `src/app/api/v1/plans/stream/route.ts`       | HIGH     | Step 5       | 30 min           |
| 7    | Add TODO comments to DB files                       | MEDIUM   | None         | 15 min           |
| 8    | Create `src/app/api/v1/user/preferences/route.ts`   | MEDIUM   | Step 1       | 1 hour           |
| 9    | Create `src/components/settings/model-selector.tsx` | LOW      | Steps 1, 8   | 2 hours          |
| 10   | Update settings page                                | LOW      | Step 9       | 30 min           |
| 11   | Deprecate Google AI provider                        | LOW      | All above    | 15 min           |

**Total Estimated Effort**: ~8 hours

---

## File Change Summary

### New Files

| File Path                                    | Purpose                            |
| -------------------------------------------- | ---------------------------------- |
| `src/lib/ai/models.ts`                       | Model configuration and validation |
| `src/app/api/v1/user/preferences/route.ts`   | User preferences API               |
| `src/components/settings/model-selector.tsx` | Model selection UI                 |

### Modified Files

| File Path                              | Changes                                       |
| -------------------------------------- | --------------------------------------------- |
| `src/lib/config/env.ts`                | Remove `enableOpenRouter`, add `defaultModel` |
| `src/lib/ai/providers/openrouter.ts`   | Make `model` required                         |
| `src/lib/ai/providers/router.ts`       | Remove Google fallback, accept model param    |
| `src/lib/ai/provider-factory.ts`       | Add `getGenerationProviderWithModel()`        |
| `src/app/api/v1/plans/stream/route.ts` | Use model-aware provider                      |
| `src/lib/db/schema/tables/users.ts`    | Add TODO for future column                    |
| `src/lib/db/queries/users.ts`          | Add TODO for future queries                   |
| `src/lib/db/schema/tables/usage.ts`    | Add TODO for cost tracking                    |
| `src/app/settings/page.tsx`            | Add AI preferences section                    |

### Deprecated Files (Keep for Rollback)

| File Path                        | Status                   |
| -------------------------------- | ------------------------ |
| `src/lib/ai/providers/google.ts` | Deprecated, keep 30 days |

---

## Testing Summary

Tests are defined inline within each phase above. Below is a consolidated checklist for tracking completion.

### Unit Tests

- [ ] **Phase 1**: Model configuration (`models.ts`)
  - [ ] `getModelById()` - valid/invalid ID handling
  - [ ] `getModelsForTier()` - tier filtering logic
  - [ ] `isValidModelId()` - validation
  - [ ] `AVAILABLE_MODELS` structure validation
- [ ] **Phase 2**: AI provider system
  - [ ] `aiEnv.defaultModel` - env var handling
  - [ ] `OpenRouterProvider` - required model, error on missing
  - [ ] `RouterGenerationProvider` - model routing, mock handling
  - [ ] `getGenerationProviderWithModel()` - factory function
- [ ] **Phase 4**: API layer
  - [ ] Model override query param parsing
  - [ ] Preferences Zod schema validation
- [ ] **Phase 5**: UI components
  - [ ] `ModelSelector` rendering and interactions
  - [ ] Tier-gating UI behavior
- [ ] **Phase 7**: Deprecation verification
  - [ ] Deprecated files have correct comments
  - [ ] Env vars properly deprecated

### Integration Tests

- [ ] **Phase 2**: Provider API calls with correct model
- [ ] **Phase 4**: Plan stream with model override/default
- [ ] **Phase 4**: User preferences API (GET/PATCH)
- [ ] **Phase 5**: ModelSelector API integration
- [ ] **Phase 7**: System works without deprecated env vars

### E2E Tests

- [ ] **Phase 4**: Full plan generation with model selection
- [ ] **Phase 5**: User model preference selection flow
- [ ] **Phase 5**: Tier-gating enforcement in UI

### Regression Tests

- [ ] **Phase 7**: Existing plan generation unchanged
- [ ] **Phase 7**: Usage tracking captures model info
- [ ] **Phase 7**: Error handling preserved

---

## Rollback Plan

If issues arise after deployment:

### Level 1: Quick Disable (< 5 min)

Set `AI_USE_MOCK=true` in production environment to disable real AI calls.

### Level 2: Provider Rollback (< 15 min)

1. Revert `src/lib/ai/providers/router.ts` to include Google AI fallback
2. Deploy hotfix

### Level 3: Full Rollback (< 30 min)

1. Revert all changes to `router.ts`, `provider-factory.ts`, and `openrouter.ts`
2. Re-add `AI_ENABLE_OPENROUTER=true` to environment
3. Deploy

### Post-Rollback

- Keep `src/lib/ai/providers/google.ts` for at least 30 days post-migration
- Monitor OpenRouter status page for issues
- Document rollback reason for post-mortem

---

## Monitoring and Alerts

### Key Metrics to Monitor

| Metric                       | Threshold     | Action                   |
| ---------------------------- | ------------- | ------------------------ |
| Plan generation success rate | < 95%         | Alert, investigate       |
| Average generation latency   | > 30s         | Alert, check model       |
| OpenRouter API errors        | > 5%          | Alert, consider rollback |
| Token usage per plan         | > 2x baseline | Alert, check prompts     |

### Dashboard Additions

- Add model breakdown to usage dashboard
- Track cost per model
- Monitor model popularity distribution

---

## Future Enhancements

After successful migration, consider:

1. **Model recommendations** - Suggest models based on plan complexity
2. **A/B testing** - Compare model quality for different plan types
3. **Cost optimization** - Route to cheaper models for simple plans
4. **Custom model configs** - Let Pro users adjust temperature, max tokens
5. **Model-specific prompts** - Optimize prompts per model capabilities
