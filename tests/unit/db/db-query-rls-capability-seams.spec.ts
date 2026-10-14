/**
 * Lightweight guardrails: high-risk modules stay aligned with DB/RLS seams documented in
 * supabase/AGENTS.md (architecture tests, not behavioral coverage).
 */

import type { Node } from 'oxc-parser';

import {
  moduleExportNameText,
  parseTypeScriptModule,
  walkAst,
} from '@tests/helpers/oxc-ast';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(TEST_DIR, '../../..');
const SRC_ROOT = resolve(REPO_ROOT, 'src');
const SUPABASE_RUNTIME = resolve(REPO_ROOT, 'supabase/runtime.ts');

const GET_DB_RUNTIME_SPECIFIERS = new Set([
  '@supabase/runtime',
  '@supabase/runtime.ts',
]);

const AMBIENT_GET_DB_IMPORT_ALLOWLIST = new Set([
  'lib/api/request-boundary.ts',
  'lib/api/auth.ts',
]);

const REQUEST_BOUNDARY_GET_DB_SITES = [
  'wrapRouteBoundaryWork',
  'action',
  'component',
] as const;

const AMBIENT_GET_DB_CALL_ALLOWLIST: Readonly<
  Record<string, ReadonlySet<string>>
> = {
  'lib/api/request-boundary.ts': new Set(REQUEST_BOUNDARY_GET_DB_SITES),
  'lib/api/auth.ts': new Set(['runWithTestContext']),
};

const NAMED_SERVICE_ROLE_OWNERS = new Set([
  'lib/db/queries/admin/jobs-metrics.ts',
  'lib/db/queries/admin/retention.ts',
  'features/lesson-content/start-module-lesson-generation-workflow.ts',
]);

const SERVICE_ROLE_DEFAULTS = [
  /\bdbClient\s*\?\?\s*serviceRoleDb\b/,
  /\bdbClient\s*=\s*serviceRoleDb\b/,
  /\bdbClient\s*:\s*typeof\s+serviceRoleDb\s*=\s*serviceRoleDb\b/,
  /\bdeps\.dbClient\s*\?\?\s*serviceRoleDb\b/,
];

const FORBIDDEN_GET_DB_FALLBACKS = [
  /\bdbClient\s*\?\?\s*getDb\s*\(/,
  /\bdbClient\s*=\s*getDb\s*\(/,
  /\bdeps\.getDb\s*\(/,
  /\bparams\.dbClient\s*\?\?\s*getDb\s*\(/,
];

const PRODUCTION_SCAN_ROOTS = [
  resolve(SRC_ROOT, 'features'),
  resolve(SRC_ROOT, 'lib'),
  resolve(SRC_ROOT, 'app'),
];

/** Heuristic only; not safe for strings containing // or block comment delimiters. */
function stripLineAndBlockComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function walkSourceFiles(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) {
    throw new Error(`Cannot find ${dir} — is the repo structure correct?`);
  }

  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      walkSourceFiles(full, acc);
    } else if (['.ts', '.tsx', '.mts', '.cts'].includes(extname(name))) {
      acc.push(full);
    }
  }
  return acc;
}

function srcRelative(absolutePath: string): string {
  return relative(SRC_ROOT, absolutePath).split('\\').join('/');
}

function isRuntimeSpecifier(specifier: string): boolean {
  if (GET_DB_RUNTIME_SPECIFIERS.has(specifier)) {
    return true;
  }
  return /(^|\/)supabase\/runtime(\.ts)?$/.test(specifier);
}

function enclosingFunctionName(ancestors: readonly Node[]): string {
  for (let i = ancestors.length - 1; i >= 0; i--) {
    const current = ancestors[i];
    const parent = ancestors[i - 1];
    if (current.type === 'FunctionDeclaration' && current.id) {
      return current.id.name;
    }
    if (
      (current.type === 'FunctionExpression' ||
        current.type === 'ArrowFunctionExpression') &&
      parent?.type === 'VariableDeclarator' &&
      parent.init === current &&
      parent.id.type === 'Identifier'
    ) {
      return parent.id.name;
    }
    if (
      (((current.type === 'MethodDefinition' ||
        current.type === 'TSAbstractMethodDefinition') &&
        current.kind === 'method') ||
        (current.type === 'Property' && current.method)) &&
      !current.computed &&
      current.key.type === 'Identifier'
    ) {
      return current.key.name;
    }
  }
  return '<module>';
}

function findRuntimeGetDbImports(
  sourceText: string,
  fileName: string,
): string[] {
  const program = parseTypeScriptModule(sourceText, fileName);
  const hits: string[] = [];

  walkAst(program, (node) => {
    if (
      node.type !== 'ImportDeclaration' ||
      !isRuntimeSpecifier(node.source.value)
    ) {
      return true;
    }
    if (node.specifiers.length === 0 || node.importKind === 'type') {
      return false;
    }
    for (const spec of node.specifiers) {
      if (spec.type === 'ImportNamespaceSpecifier') {
        hits.push(`namespace import ${spec.local.name}`);
      } else if (
        spec.type === 'ImportSpecifier' &&
        spec.importKind !== 'type' &&
        moduleExportNameText(spec.imported) === 'getDb'
      ) {
        hits.push('named getDb import');
      }
    }
    for (const spec of node.specifiers) {
      if (spec.type === 'ImportDefaultSpecifier') {
        hits.push(`default import ${spec.local.name}`);
      }
    }
    return false;
  });

  return hits;
}

function findGetDbCallSites(sourceText: string, fileName: string): string[] {
  const program = parseTypeScriptModule(sourceText, fileName);
  const sites: string[] = [];

  function isGetDbCallee(expr: Node): boolean {
    if (expr.type === 'Identifier' && expr.name === 'getDb') {
      return true;
    }
    return (
      expr.type === 'MemberExpression' &&
      !expr.computed &&
      expr.property.type === 'Identifier' &&
      expr.property.name === 'getDb'
    );
  }

  walkAst(program, (node, ancestors) => {
    if (node.type === 'CallExpression' && isGetDbCallee(node.callee)) {
      sites.push(enclosingFunctionName(ancestors));
    }
    return true;
  });

  return sites;
}

function collectAmbientGetDbViolations(files: string[]): string[] {
  const violations: string[] = [];

  for (const file of files) {
    const rel = srcRelative(file);
    const source = readFileSync(file, 'utf8');
    const withoutComments = stripLineAndBlockComments(source);

    const runtimeImports = findRuntimeGetDbImports(source, file);
    if (
      runtimeImports.length > 0 &&
      !AMBIENT_GET_DB_IMPORT_ALLOWLIST.has(rel)
    ) {
      violations.push(
        `${rel}: runtime getDb import from @supabase/runtime (${runtimeImports.join(', ')})`,
      );
    }

    const callSites = findGetDbCallSites(source, file);
    const allowedFns = AMBIENT_GET_DB_CALL_ALLOWLIST[rel];
    for (const fn of callSites) {
      if (!allowedFns) {
        violations.push(`${rel}: getDb() call in ${fn}`);
        continue;
      }
      if (!allowedFns.has(fn)) {
        violations.push(
          `${rel}: getDb() call in ${fn} (not an establishment site)`,
        );
      }
    }

    for (const pattern of FORBIDDEN_GET_DB_FALLBACKS) {
      if (pattern.test(withoutComments)) {
        violations.push(`${rel}: forbidden getDb fallback ${pattern}`);
      }
    }

    if (!NAMED_SERVICE_ROLE_OWNERS.has(rel)) {
      for (const pattern of SERVICE_ROLE_DEFAULTS) {
        if (pattern.test(withoutComments)) {
          violations.push(`${rel}: unnamed service-role default ${pattern}`);
        }
      }
    }
  }

  return violations;
}

describe('DB query RLS capability seams', () => {
  it('attempts module keeps explicit dbClient (no runtime getDb import/default)', () => {
    const attempts = readFileSync(
      resolve(SRC_ROOT, 'lib/db/queries/attempts.ts'),
      'utf8',
    );
    expect(attempts).not.toContain(`from '@supabase/runtime'`);
    expect(attempts).not.toContain(`from "@supabase/runtime"`);
    const withoutComments = stripLineAndBlockComments(attempts);
    expect(withoutComments).not.toMatch(/\bdbClient\s*=\s*getDb\s*\(\)/);
  });

  it('lockOwnedPlanById requires explicit dbClient', () => {
    const plansHelpers = readFileSync(
      resolve(SRC_ROOT, 'lib/db/queries/helpers/plans-helpers.ts'),
      'utf8',
    );
    const lockedIface =
      plansHelpers.match(
        /interface LockedOwnedPlanQueryParams \{[^}]+\}/,
      )?.[0] ?? '';
    expect(lockedIface).toContain('interface LockedOwnedPlanQueryParams');
    expect(lockedIface).toContain('dbClient: PlanQueryClient');
    expect(lockedIface).not.toContain('dbClient?:');
  });

  it('admin jobs-metrics defaults to service-role only', () => {
    const metrics = readFileSync(
      resolve(SRC_ROOT, 'lib/db/queries/admin/jobs-metrics.ts'),
      'utf8',
    );
    expect(metrics).toContain(`db as serviceRoleDb`);
    expect(metrics).toContain(`dbClient: typeof serviceRoleDb = serviceRoleDb`);
    expect(metrics).not.toContain(`from '@supabase/runtime'`);
    expect(metrics).not.toContain(`from "@supabase/runtime"`);
    const withoutComments = stripLineAndBlockComments(metrics);
    expect(withoutComments).not.toMatch(/\bdbClient\s*=\s*getDb\s*\(\)/);
  });

  it('production source forbids ambient getDb below request establishment', () => {
    const files = PRODUCTION_SCAN_ROOTS.flatMap((dir) => walkSourceFiles(dir));
    expect(
      files.some((file) => srcRelative(file).startsWith('features/')),
    ).toBe(true);
    expect(
      files.some((file) => srcRelative(file).startsWith('lib/db/queries/')),
    ).toBe(true);
    expect(collectAmbientGetDbViolations(files)).toEqual([]);
  });

  it('covers unlisted feature directories such as jobs and auth', () => {
    const featureFiles = walkSourceFiles(resolve(SRC_ROOT, 'features'));
    const rels = featureFiles.map((file) => srcRelative(file));
    expect(rels.some((rel) => rel.startsWith('features/jobs/'))).toBe(true);
    expect(rels.some((rel) => rel.startsWith('features/auth/'))).toBe(true);
    expect(
      collectAmbientGetDbViolations(featureFiles).filter((v) =>
        v.startsWith('features/jobs/'),
      ),
    ).toEqual([]);

    const forbidden = `
import { getDb } from '@supabase/runtime';
export const db = getDb();
`;
    expect(
      findRuntimeGetDbImports(forbidden, 'features/jobs/synthetic.ts'),
    ).toEqual(['named getDb import']);
    expect(findGetDbCallSites(forbidden, 'features/jobs/synthetic.ts')).toEqual(
      ['<module>'],
    );

    const typeOnly = `import type { getDb } from '@supabase/runtime';\n`;
    expect(
      findRuntimeGetDbImports(typeOnly, 'features/auth/synthetic.ts'),
    ).toEqual([]);
    expect(findGetDbCallSites(typeOnly, 'features/auth/synthetic.ts')).toEqual(
      [],
    );

    const commentOnly = `// import { getDb } from '@supabase/runtime'\nconst x = 1;\n`;
    expect(
      findRuntimeGetDbImports(commentOnly, 'features/jobs/synthetic.ts'),
    ).toEqual([]);
    expect(
      findGetDbCallSites(commentOnly, 'features/jobs/synthetic.ts'),
    ).toEqual([]);
  });

  it('keeps ambient getDb acquisition only at request establishment', () => {
    const requestBoundary = readFileSync(
      resolve(SRC_ROOT, 'lib/api/request-boundary.ts'),
      'utf8',
    );
    const auth = readFileSync(resolve(SRC_ROOT, 'lib/api/auth.ts'), 'utf8');
    const runtime = readFileSync(SUPABASE_RUNTIME, 'utf8');

    expect(
      findRuntimeGetDbImports(requestBoundary, 'request-boundary.ts'),
    ).toEqual(['named getDb import']);
    expect(findRuntimeGetDbImports(auth, 'auth.ts')).toEqual([
      'named getDb import',
    ]);
    expect(findGetDbCallSites(requestBoundary, 'request-boundary.ts')).toEqual([
      ...REQUEST_BOUNDARY_GET_DB_SITES,
    ]);
    expect(findGetDbCallSites(auth, 'auth.ts')).toEqual(['runWithTestContext']);
    expect(auth).not.toMatch(/\brequireCurrentUserRecord\b/);
    expect(runtime).not.toMatch(/\brequireCurrentUserRecord\b/);
    expect(runtime).toContain('runWithTestContext');
    expect(runtime).toContain('request-boundary.ts');

    const streamCleanup = readFileSync(
      resolve(SRC_ROOT, 'features/plans/session/stream-cleanup.ts'),
      'utf8',
    );
    expect(streamCleanup).toContain('MissingRequestDbContextError');
    expect(findRuntimeGetDbImports(streamCleanup, 'stream-cleanup.ts')).toEqual(
      [],
    );
    expect(findGetDbCallSites(streamCleanup, 'stream-cleanup.ts')).toEqual([]);
  });
});
