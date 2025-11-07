import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Guard test to ensure all plan-fetching functions in queries/plans.ts
 * require userId parameter for tenant scoping.
 *
 * This test prevents regressions where unsafe plan loaders are added
 * that bypass tenant isolation.
 */
describe('Plan Queries - Tenant Scoping Guard', () => {
  it('ensures all exported plan-fetching functions require userId parameter', () => {
    const plansQueryPath = join(process.cwd(), 'src/lib/db/queries/plans.ts');
    const fileContent = readFileSync(plansQueryPath, 'utf-8');

    // Pattern to match exported async functions that fetch plans
    // Matches: export async function getXxx(planId: string, ...)
    // or: export async function getXxx(...) that might fetch plans
    const planFetchingFunctionPattern =
      /export\s+async\s+function\s+(get\w*Plan\w*|get\w*Plans\w*)\s*\([^)]*\)/g;

    const matches = Array.from(
      fileContent.matchAll(planFetchingFunctionPattern)
    );

    // List of functions that are allowed to not have userId (e.g., internal helpers)
    const allowedWithoutUserId: string[] = [
      // No exceptions - all plan-fetching functions MUST have userId
    ];

    // List of functions that should have userId
    const functionsRequiringUserId: string[] = [];

    for (const match of matches) {
      const functionName = match[1];
      const functionSignature = match[0];

      // Check if function signature includes userId parameter
      const hasUserId = /userId\s*:\s*string/.test(functionSignature);

      if (!hasUserId && !allowedWithoutUserId.includes(functionName)) {
        functionsRequiringUserId.push(functionName);
      }
    }

    if (functionsRequiringUserId.length > 0) {
      throw new Error(
        `Security violation: The following plan-fetching functions are missing userId parameter for tenant scoping:\n` +
          `${functionsRequiringUserId.join(', ')}\n\n` +
          `All functions that fetch learning plans MUST accept userId: string and enforce ownership ` +
          `in the query WHERE clause to prevent cross-tenant data access.\n\n` +
          `Example safe pattern:\n` +
          `export async function getXxx(planId: string, userId: string) {\n` +
          `  return await db.select().from(learningPlans)\n` +
          `    .where(and(eq(learningPlans.id, planId), eq(learningPlans.userId, userId)));\n` +
          `}`
      );
    }

    // If we get here, all plan-fetching functions have userId
    expect(functionsRequiringUserId).toHaveLength(0);
  });

  it('ensures no plan-fetching functions use only planId without userId', () => {
    const plansQueryPath = join(process.cwd(), 'src/lib/db/queries/plans.ts');
    const fileContent = readFileSync(plansQueryPath, 'utf-8');

    // Pattern to match functions that take only planId (or planId first) without userId
    // This catches cases like: function getXxx(planId: string) without userId
    const unsafePattern =
      /export\s+async\s+function\s+(get\w*Plan\w*|get\w*Plans\w*)\s*\(\s*planId\s*:\s*string\s*(?:,\s*[^)]*)?\)/g;

    const matches = Array.from(fileContent.matchAll(unsafePattern));

    const unsafeFunctions: string[] = [];

    for (const match of matches) {
      const functionSignature = match[0];
      const functionName = match[1];

      // Check if userId appears in the signature
      const hasUserId = functionSignature.includes('userId');

      if (!hasUserId) {
        unsafeFunctions.push(functionName);
      }
    }

    if (unsafeFunctions.length > 0) {
      throw new Error(
        `Security violation: The following functions fetch plans using only planId without userId:\n` +
          `${unsafeFunctions.join(', ')}\n\n` +
          `These functions violate tenant isolation and must be removed or updated to require userId.`
      );
    }

    expect(unsafeFunctions).toHaveLength(0);
  });
});
