import { beforeAll, describe, expect, it } from 'vitest';
import { planOrigin } from '@/lib/db/enums';

/**
 * Regression tests for GitHub Issue #283.
 *
 * The OpenAPI response schemas previously excluded 'pdf' from their origin
 * enums while the DB enum and request schemas included it. This was a
 * contract violation: clients could create PDF-origin plans but the response
 * schema declared that origin value impossible.
 *
 * These tests verify that every OpenAPI schema exposing an origin enum stays
 * in sync with the DB planOrigin enum — the single source of truth.
 */

type OpenApiSchema = {
  properties?: Record<string, { enum?: string[] }>;
  allOf?: Array<{ properties?: Record<string, { enum?: string[] }> }>;
};

type OpenApiDocument = {
  components?: {
    schemas?: Record<string, OpenApiSchema>;
  };
};

function getOriginEnum(schema: OpenApiSchema): string[] | undefined {
  if (schema.properties?.origin?.enum) {
    return schema.properties.origin.enum;
  }
  for (const entry of schema.allOf ?? []) {
    if (entry.properties?.origin?.enum) {
      return entry.properties.origin.enum;
    }
  }
  return undefined;
}

describe('OpenAPI origin enum parity with DB planOrigin', () => {
  const dbOriginValues = [...planOrigin.enumValues].sort();
  let schemas: Record<string, OpenApiSchema>;

  beforeAll(async () => {
    const { getOpenApiDocument } = await import('@/lib/api/openapi');
    const doc = (await getOpenApiDocument()) as OpenApiDocument;
    schemas = doc.components?.schemas ?? {};
  });

  it('DB planOrigin enum includes pdf', () => {
    expect(planOrigin.enumValues).toContain('pdf');
  });

  it('LearningPlan response schema origin matches DB enum', () => {
    const originEnum = getOriginEnum(schemas.LearningPlan);
    expect(originEnum).toBeDefined();
    if (!originEnum) {
      throw new Error('expected LearningPlan.origin enum');
    }
    expect([...originEnum].sort()).toEqual(dbOriginValues);
  });

  it('CreatePlanResponse schema origin matches DB enum', () => {
    const originEnum = getOriginEnum(schemas.CreatePlanResponse);
    expect(originEnum).toBeDefined();
    if (!originEnum) {
      throw new Error('expected CreatePlanResponse.origin enum');
    }
    expect([...originEnum].sort()).toEqual(dbOriginValues);
  });

  it('CreateLearningPlanRequest schema origin matches DB enum', () => {
    const originEnum = getOriginEnum(schemas.CreateLearningPlanRequest);
    expect(originEnum).toBeDefined();
    if (!originEnum) {
      throw new Error('expected CreateLearningPlanRequest.origin enum');
    }
    expect([...originEnum].sort()).toEqual(dbOriginValues);
  });
});
