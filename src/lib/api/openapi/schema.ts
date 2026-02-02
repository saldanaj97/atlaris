import {
  OpenAPIRegistry,
  OpenApiGeneratorV3,
  extendZodWithOpenApi,
} from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

import {
  LEARNING_STYLES,
  SKILL_LEVELS,
  type LearningStyle,
  type SkillLevel,
} from '@/lib/types/db';
import { createLearningPlanSchema } from '@/lib/validation/learningPlans';

// Initialize OpenAPI extension for Zod (must be called once)
extendZodWithOpenApi(z);

const registry = new OpenAPIRegistry();

const SKILL_LEVEL_ENUM = z.enum(SKILL_LEVELS as [SkillLevel, ...SkillLevel[]]);
const LEARNING_STYLE_ENUM = z.enum(
  LEARNING_STYLES as [LearningStyle, ...LearningStyle[]]
);

const errorResponseSchema = z
  .object({
    error: z.string(),
    details: z.unknown().optional(),
  })
  .openapi('ErrorResponse');

const learningPlanSchema = z
  .object({
    id: z.string().uuid(),
    topic: z.string(),
    skillLevel: SKILL_LEVEL_ENUM,
    weeklyHours: z.number().int().nullable().optional(),
    learningStyle: LEARNING_STYLE_ENUM,
    visibility: z.enum(['private', 'public'] as const),
    origin: z.enum(['ai', 'manual', 'template'] as const),
    createdAt: z.string().datetime().nullable().optional(),
  })
  .openapi('LearningPlan');

const planSummarySchema = z
  .object({
    plan: learningPlanSchema,
    completion: z.number(),
    completedTasks: z.number().int(),
    totalTasks: z.number().int(),
    totalMinutes: z.number().int(),
    completedMinutes: z.number().int(),
    modules: z.array(
      z.object({
        id: z.string().uuid(),
        planId: z.string().uuid(),
        title: z.string(),
        order: z.number().int(),
      })
    ),
    completedModules: z.number().int(),
  })
  .openapi('PlanSummary');

const createPlanResponseSchema = z
  .object({
    id: z.string().uuid(),
    topic: z.string(),
    skillLevel: SKILL_LEVEL_ENUM,
    weeklyHours: z.number().int().nullable().optional(),
    learningStyle: LEARNING_STYLE_ENUM,
    visibility: z.enum(['private', 'public'] as const),
    origin: z.enum(['ai', 'manual', 'template'] as const),
    createdAt: z.string().datetime().nullable().optional(),
    status: z.enum(['pending'] as const),
  })
  .openapi('CreatePlanResponse');

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
          schema: z.array(planSummarySchema),
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
  method: 'post',
  path: '/api/v1/plans',
  summary: 'Create learning plan',
  description:
    'Creates a new learning plan and enqueues an AI generation job for the authenticated user.',
  request: {
    body: {
      description: 'Plan creation payload.',
      required: true,
      content: {
        'application/json': {
          schema: createLearningPlanSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Learning plan created.',
      content: {
        'application/json': {
          schema: createPlanResponseSchema,
        },
      },
    },
    400: {
      description: 'Validation error.',
      content: {
        'application/json': {
          schema: errorResponseSchema,
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
    403: {
      description: 'Plan caps or limits exceeded.',
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

export function getOpenApiDocument() {
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
