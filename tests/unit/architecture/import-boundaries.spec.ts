import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..');
const SRC_ROOT = join(REPO_ROOT, 'src');
const FEATURES_ROOT = join(SRC_ROOT, 'features');
const APP_ROOT = join(SRC_ROOT, 'app');

const PLANS_QUERIES_MODULE = '@/lib/db/queries/plans';

const BLOCKED_PLAN_READ_EXPORTS = new Set([
  'getLearningPlanDetail',
  'getLightweightPlanSummaries',
  'getPlanStatusForUser',
  'getPlanSummariesForUser',
  'getPlanSummaryCount',
]);

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

function normalizeToSrcPath(absolutePath: string): string | null {
  const rel = relative(SRC_ROOT, absolutePath);
  if (rel.startsWith('..')) {
    return null;
  }
  return rel.split('\\').join('/');
}

/**
 * Resolves an import specifier to a path under `src/` when it targets app code.
 */
function resolvesToAppLayer(fromFile: string, specifier: string): boolean {
  if (specifier.startsWith('@/')) {
    return specifier.startsWith('@/app/');
  }
  if (!specifier.startsWith('.')) {
    return false;
  }
  const resolved = resolve(join(fromFile, '..'), specifier);
  const underSrc = normalizeToSrcPath(resolved);
  return underSrc?.startsWith('app/') ?? false;
}

function resolvesToPlansQueriesModule(
  fromFile: string,
  specifier: string
): boolean {
  if (specifier === PLANS_QUERIES_MODULE) {
    return true;
  }
  if (!specifier.startsWith('.')) {
    return false;
  }
  const resolved = resolve(join(fromFile, '..'), specifier);
  const normalized = normalizeToSrcPath(resolved);
  if (normalized === null) {
    return false;
  }
  return (
    normalized === 'lib/db/queries/plans' ||
    normalized === 'lib/db/queries/plans.ts' ||
    normalized === 'lib/db/queries/plans.tsx'
  );
}

type ParsedImport = {
  specifier: string;
  named: Set<string>;
  isNamespace: boolean;
  isExportAll: boolean;
};

function parseImports(sourceText: string, fileName: string): ParsedImport[] {
  const sourceFile = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );

  const results: ParsedImport[] = [];

  function visit(node: ts.Node): void {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      const specifier = node.moduleSpecifier.text;
      const named = new Set<string>();
      let isNamespace = false;
      let isExportAll = false;

      if (ts.isImportDeclaration(node)) {
        const clause = node.importClause;
        if (clause?.isTypeOnly) {
          results.push({ specifier, named, isNamespace, isExportAll });
          return;
        }

        if (clause?.namedBindings) {
          if (ts.isNamespaceImport(clause.namedBindings)) {
            isNamespace = true;
          } else if (ts.isNamedImports(clause.namedBindings)) {
            for (const el of clause.namedBindings.elements) {
              if (el.isTypeOnly) {
                continue;
              }
              const exportedName = el.propertyName?.text ?? el.name.text;
              named.add(exportedName);
            }
          }
        }
      } else if (node.exportClause === undefined) {
        isExportAll = true;
      } else if (ts.isNamespaceExport(node.exportClause)) {
        isNamespace = true;
      } else if (ts.isNamedExports(node.exportClause)) {
        for (const el of node.exportClause.elements) {
          const exportedName = el.propertyName?.text ?? el.name.text;
          named.add(exportedName);
        }
      }

      results.push({ specifier, named, isNamespace, isExportAll });
      return;
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return results;
}

describe('import boundary helpers', () => {
  it('matches extensionless relative paths to plans queries', () => {
    expect(
      resolvesToPlansQueriesModule(
        join(APP_ROOT, 'api/v1/plans/route.ts'),
        '../../../../lib/db/queries/plans'
      )
    ).toBe(true);
  });

  it('captures re-export declarations', () => {
    expect(
      parseImports(
        "export { getLearningPlanDetail } from '@/lib/db/queries/plans';",
        join(APP_ROOT, 'plans/reexports.ts')
      )
    ).toEqual([
      {
        specifier: '@/lib/db/queries/plans',
        named: new Set(['getLearningPlanDetail']),
        isNamespace: false,
        isExportAll: false,
      },
    ]);
  });
});

describe('import boundaries (Slice B)', () => {
  it('forbids src/features from importing src/app', () => {
    const violations: string[] = [];
    const featureFiles = walkSourceFiles(FEATURES_ROOT);

    for (const filePath of featureFiles) {
      const source = readFileSync(filePath, 'utf8');
      const imports = parseImports(source, filePath);
      const relFile = relative(REPO_ROOT, filePath);

      for (const imp of imports) {
        if (resolvesToAppLayer(filePath, imp.specifier)) {
          violations.push(
            `${relFile}: forbidden import of app layer from features (${imp.specifier})`
          );
        }
      }
    }

    expect(violations, violations.join('\n')).toEqual([]);
  });

  it('forbids src/app from importing blocked plan read exports from plans queries', () => {
    const violations: string[] = [];
    const appFiles = walkSourceFiles(APP_ROOT);

    for (const filePath of appFiles) {
      const source = readFileSync(filePath, 'utf8');
      const imports = parseImports(source, filePath);
      const relFile = relative(REPO_ROOT, filePath);

      for (const imp of imports) {
        if (!resolvesToPlansQueriesModule(filePath, imp.specifier)) {
          continue;
        }
        if (imp.isNamespace || imp.isExportAll) {
          violations.push(
            `${relFile}: namespace/export-all dependency on plans queries module is not allowed in app (${imp.specifier})`
          );
          continue;
        }
        for (const name of imp.named) {
          if (BLOCKED_PLAN_READ_EXPORTS.has(name)) {
            violations.push(
              `${relFile}: forbidden direct import of ${name} from ${imp.specifier}`
            );
          }
        }
      }
    }

    expect(violations, violations.join('\n')).toEqual([]);
  });
});
