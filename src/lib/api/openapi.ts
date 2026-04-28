import {
  extendZodWithOpenApi,
  OpenAPIRegistry,
  OpenApiGeneratorV3,
} from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

import { LEARNING_STYLES, SKILL_LEVELS } from '@/shared/types/db';
import type { LearningStyle, SkillLevel } from '@/shared/types/db.types';

// Initialize OpenAPI extension for Zod (must be called once)
extendZodWithOpenApi(z);

const SKILL_LEVEL_ENUM = z.enum(SKILL_LEVELS as [SkillLevel, ...SkillLevel[]]);
const LEARNING_STYLE_ENUM = z.enum(
  LEARNING_STYLES as [LearningStyle, ...LearningStyle[]],
);

const errorResponseSchema = z
  .object({
    error: z.string(),
    code: z.string(),
    classification: z
      .enum(['validation', 'provider_error', 'rate_limit', 'timeout', 'capped'])
      .optional(),
    details: z.unknown().optional(),
    retryAfter: z.number().int().nonnegative().optional(),
  })
  .openapi('ErrorResponse');

const learningPlanBaseFields = {
  id: z.string().uuid(),
  topic: z.string(),
  skillLevel: SKILL_LEVEL_ENUM,
  weeklyHours: z.number().int().nullable().optional(),
  learningStyle: LEARNING_STYLE_ENUM,
  visibility: z.literal('private'),
  origin: z.enum(['ai', 'manual', 'template'] as const),
  createdAt: z.string().datetime().nullable().optional(),
};

const learningPlanSchema = z.object({
  ...learningPlanBaseFields,
});

const lightweightPlanSummarySchema = z
  .object({
    id: z.string().uuid(),
    topic: z.string(),
    skillLevel: SKILL_LEVEL_ENUM,
    learningStyle: LEARNING_STYLE_ENUM,
    visibility: z.literal('private'),
    origin: z.enum(['ai', 'manual', 'template'] as const),
    generationStatus: z.enum([
      'generating',
      'ready',
      'failed',
      'pending_retry',
    ] as const),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    completion: z.number(),
    completedTasks: z.number().int(),
    totalTasks: z.number().int(),
    totalMinutes: z.number().int(),
    completedMinutes: z.number().int(),
    moduleCount: z.number().int(),
    completedModules: z.number().int(),
  })
  .openapi('LightweightPlanSummary');

const subscriptionUsageSchema = z.object({
  activePlans: z.number().int(),
  regenerations: z.number().int(),
  exports: z.number().int(),
});

const subscriptionResponseSchema = z
  .object({
    tier: z.enum(['free', 'starter', 'pro']),
    status: z.enum(['active', 'canceled', 'past_due', 'trialing']).nullable(),
    periodEnd: z.string().datetime().nullable(),
    cancelAtPeriodEnd: z.boolean(),
    usage: subscriptionUsageSchema,
  })
  .openapi('SubscriptionResponse');

export async function getOpenApiDocument() {
  const registry = new OpenAPIRegistry();

  registry.register('LearningPlan', learningPlanSchema);

  registry.registerPath({
    method: 'get',
    path: '/api/v1/plans',
    summary: 'List learning plans',
    description:
      'Returns learning plans and derived progress for the authenticated user.',
    responses: {
      200: {
        description: 'List of learning plans.',
        content: {
          'application/json': {
            schema: z.array(lightweightPlanSummarySchema),
          },
        },
      },
      401: {
        description: 'Authentication required.',
        content: {
          'application/json': {
            schema: errorResponseSchema,
          },
        },
      },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/api/v1/user/subscription',
    summary: 'Get subscription summary',
    description:
      'Returns subscription tier, billing status, and usage metrics for the authenticated user.',
    responses: {
      200: {
        description: 'Subscription summary.',
        content: {
          'application/json': {
            schema: subscriptionResponseSchema,
          },
        },
      },
      401: {
        description: 'Authentication required.',
        content: {
          'application/json': {
            schema: errorResponseSchema,
          },
        },
      },
      404: {
        description: 'User not found.',
        content: {
          'application/json': {
            schema: errorResponseSchema,
          },
        },
      },
    },
  });

  const generator = new OpenApiGeneratorV3(registry.definitions);

  return generator.generateDocument({
    openapi: '3.1.0',
    info: {
      title: 'Atlaris API',
      version: '0.1.0',
      description:
        'Internal API documentation for the Atlaris learning plan service.',
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description:
          'Local development server (update base URL when deploying OpenAPI spec externally).',
      },
    ],
  });
}
