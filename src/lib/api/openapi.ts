import {
  OpenAPIRegistry,
  OpenApiGeneratorV3,
  extendZodWithOpenApi,
} from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

import { LEARNING_STYLES, SKILL_LEVELS } from '@/shared/types/db';
import type { LearningStyle, SkillLevel } from '@/shared/types/db.types';

// Initialize OpenAPI extension for Zod (must be called once)
extendZodWithOpenApi(z);

const SKILL_LEVEL_ENUM = z.enum(SKILL_LEVELS as [SkillLevel, ...SkillLevel[]]);
const LEARNING_STYLE_ENUM = z.enum(
  LEARNING_STYLES as [LearningStyle, ...LearningStyle[]]
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

const learningPlanSchema = z.object({
  id: z.string().uuid(),
  topic: z.string(),
  skillLevel: SKILL_LEVEL_ENUM,
  weeklyHours: z.number().int().nullable().optional(),
  learningStyle: LEARNING_STYLE_ENUM,
  visibility: z.literal('private'),
  origin: z.enum(['ai', 'manual', 'template', 'pdf'] as const),
  createdAt: z.string().datetime().nullable().optional(),
});

const lightweightPlanSummarySchema = z
  .object({
    id: z.string().uuid(),
    topic: z.string(),
    skillLevel: SKILL_LEVEL_ENUM,
    learningStyle: LEARNING_STYLE_ENUM,
    visibility: z.literal('private'),
    origin: z.enum(['ai', 'manual', 'template', 'pdf'] as const),
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

const createPlanResponseSchema = z
  .object({
    id: z.string().uuid(),
    topic: z.string(),
    skillLevel: SKILL_LEVEL_ENUM,
    weeklyHours: z.number().int().nullable().optional(),
    learningStyle: LEARNING_STYLE_ENUM,
    visibility: z.literal('private'),
    origin: z.enum(['ai', 'manual', 'template', 'pdf'] as const),
    createdAt: z.string().datetime().nullable().optional(),
    status: z.literal('generating'),
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

async function buildCreatePlanRequestSchema() {
  const { createLearningPlanObject } = await import(
    '@/shared/schemas/learning-plans.schemas'
  );

  const createLearningPlanShape = createLearningPlanObject.shape;

  return z
    .object({
      ...createLearningPlanShape,
      topic: createLearningPlanShape.topic.openapi({
        description:
          'Plan topic. Required for non-PDF plans (min 3 characters). Optional for PDF plans - derived from extractedContent.mainTopic if omitted.',
      }),
      origin: createLearningPlanShape.origin.openapi({
        description:
          'Plan origin. Determines conditional field requirements: "pdf" requires PDF proof fields; "ai", "manual", or "template" require topic.',
      }),
      extractedContent: createLearningPlanShape.extractedContent.openapi({
        description:
          'Parsed PDF content. Required when origin is "pdf"; must not be present otherwise.',
      }),
      pdfProofToken: createLearningPlanShape.pdfProofToken.openapi({
        description:
          'Upload proof token. Required when origin is "pdf"; must not be present otherwise.',
      }),
      pdfExtractionHash: createLearningPlanShape.pdfExtractionHash.openapi({
        description:
          'SHA-256 hex digest of the PDF extraction. Required when origin is "pdf"; must not be present otherwise.',
      }),
      pdfProofVersion: createLearningPlanShape.pdfProofVersion.openapi({
        description:
          'Proof version (must be 1). Required when origin is "pdf"; must not be present otherwise.',
      }),
    })
    .strict()
    .openapi('CreateLearningPlanRequest', {
      description:
        'Plan creation payload. Field requirements are conditional on origin - see individual field descriptions for PDF vs non-PDF rules.',
    });
}

export async function getOpenApiDocument() {
  const registry = new OpenAPIRegistry();
  const createPlanRequestSchema = await buildCreatePlanRequestSchema();

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
    method: 'post',
    path: '/api/v1/plans',
    summary: 'Create learning plan shell',
    description:
      'Creates a new learning plan shell for the authenticated user and returns it in the initial generating state. PDF-origin requests must include extraction proof fields, including pdfProofVersion.',
    request: {
      body: {
        description:
          'Plan creation payload. Field requirements are conditional on the origin field - see the CreateLearningPlanRequest schema for details.',
        required: true,
        content: {
          'application/json': {
            schema: createPlanRequestSchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: 'Learning plan shell created.',
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
