/**
 * Drizzle column dead-code audit.
 *
 * Walks every file under src/lib/db/schema/tables/, extracts column
 * declarations of the form `columnName: type(...)` (Drizzle's pattern), and
 * counts cross-repo references for each column. Columns whose only
 * references are the schema declaration itself + migration SQL are reported
 * as candidates for removal.
 *
 * Output goes to scripts/audit-drizzle-columns.report.json. The script never
 * mutates the database; deciding what to drop and generating a Drizzle
 * migration are explicit follow-up steps.
 *
 * Usage:
 *   pnpm check:dead-columns
 *   pnpm exec tsx scripts/audit-drizzle-columns.ts
 */

import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '..');
const TABLES_DIR = join(REPO_ROOT, 'src', 'lib', 'db', 'schema', 'tables');
const REPORT_PATH = join(SCRIPT_DIR, 'audit-drizzle-columns.report.json');

const SEARCH_GLOBS = ['src', 'scripts', 'tests', 'docs'];

const COLUMN_REGEX =
  /^\s{2,}([a-zA-Z][a-zA-Z0-9]*)\s*:\s*(?:[a-zA-Z]+\([^)]*\)|sql)/gm;

interface ColumnReport {
  table: string;
  column: string;
  references: number;
  sites: string[];
}

interface AuditReport {
  generatedAt: string;
  repoRoot: string;
  tablesScanned: string[];
  columns: ColumnReport[];
  candidates: ColumnReport[];
}

function listTableFiles(): string[] {
  return readdirSync(TABLES_DIR)
    .filter((name) => name.endsWith('.ts') && name !== 'common.ts')
    .map((name) => join(TABLES_DIR, name));
}

function extractColumns(
  file: string,
): Array<{ table: string; column: string }> {
  const source = readFileSync(file, 'utf8');
  const tableName = inferTableName(source, file);
  const out: Array<{ table: string; column: string }> = [];
  let match: RegExpExecArray | null;
  COLUMN_REGEX.lastIndex = 0;
  match = COLUMN_REGEX.exec(source);
  while (match !== null) {
    const column = match[1];
    if (!isLikelyColumn(column)) {
      match = COLUMN_REGEX.exec(source);
      continue;
    }
    out.push({ table: tableName, column });
    match = COLUMN_REGEX.exec(source);
  }
  return dedupe(out);
}

function inferTableName(source: string, file: string): string {
  const tableMatch = source.match(/pgTable\(\s*['"]([a-z0-9_]+)['"]/);
  if (tableMatch) return tableMatch[1];
  return file.split('/').pop()!.replace(/\.ts$/, '');
}

const SCHEMA_HELPER_KEYWORDS = new Set([
  'check',
  'index',
  'uniqueIndex',
  'foreignKey',
  'primaryKey',
  'unique',
  'pgEnum',
  'pgSchema',
  'sql',
  'relations',
]);

function isLikelyColumn(name: string): boolean {
  if (SCHEMA_HELPER_KEYWORDS.has(name)) return false;
  if (name === name.toUpperCase()) return false;
  return /^[a-z][a-zA-Z0-9]*$/.test(name);
}

function dedupe<T extends { table: string; column: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of rows) {
    const key = `${row.table}::${row.column}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

function ripgrepCount(query: string): {
  count: number;
  sites: string[];
} {
  const args = [
    '-n',
    '--no-heading',
    '--glob',
    '!src/lib/db/migrations/**',
    '--glob',
    '!**/audit-drizzle-columns.*',
    query,
    ...SEARCH_GLOBS,
  ];
  const result = spawnSync('rg', args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  if (result.status === 1) {
    return { count: 0, sites: [] };
  }
  if (result.status !== 0) {
    throw new Error(
      `ripgrep failed (exit ${result.status}): ${result.stderr.trim()}`,
    );
  }
  const lines = result.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  return { count: lines.length, sites: lines.slice(0, 5) };
}

function camelToSnake(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
}

function auditColumn(table: string, column: string): ColumnReport {
  // camelCase usage in TS code
  const camel = ripgrepCount(`\\b${column}\\b`);
  // snake_case usage in SQL (RLS policies, migrations, raw queries)
  const snake = camelToSnake(column);
  const snakeCount =
    snake !== column ? ripgrepCount(`\\b${snake}\\b`) : { count: 0, sites: [] };

  const totalSites = [...camel.sites, ...snakeCount.sites].slice(0, 8);
  return {
    table,
    column,
    references: camel.count + snakeCount.count,
    sites: totalSites,
  };
}

function main(): void {
  const tableFiles = listTableFiles();
  const allColumns: Array<{ table: string; column: string }> = [];
  for (const file of tableFiles) {
    allColumns.push(...extractColumns(file));
  }

  const reports: ColumnReport[] = [];
  for (const { table, column } of allColumns) {
    reports.push(auditColumn(table, column));
  }

  // Dedup again across tables (some columns share names like createdAt)
  const reportsSorted = reports.sort(
    (a, b) =>
      a.references - b.references ||
      a.table.localeCompare(b.table) ||
      a.column.localeCompare(b.column),
  );

  // A column is "schema-only" when both camel and snake forms appear at
  // most three times: the declaration line in tables/*.ts, optionally an
  // index/policy reference in the same file, and a re-export in the
  // schema barrel. Anything beyond that is real usage.
  const candidates = reportsSorted.filter((row) => row.references <= 3);

  const audit: AuditReport = {
    generatedAt: new Date().toISOString(),
    repoRoot: REPO_ROOT,
    tablesScanned: tableFiles.map((file) => file.replace(`${REPO_ROOT}/`, '')),
    columns: reportsSorted,
    candidates,
  };

  writeFileSync(REPORT_PATH, `${JSON.stringify(audit, null, 2)}\n`, 'utf8');

  console.log(
    `Audited ${audit.columns.length} columns across ${audit.tablesScanned.length} tables.`,
  );
  console.log(`Removal candidates (references <= 3): ${candidates.length}`);
  if (candidates.length > 0) {
    console.log('Top candidates:');
    for (const candidate of candidates.slice(0, 10)) {
      console.log(
        `  - ${candidate.table}.${candidate.column}: ${candidate.references} reference(s)`,
      );
    }
  }
  console.log(`Full report written to ${REPORT_PATH}`);
}

main();
