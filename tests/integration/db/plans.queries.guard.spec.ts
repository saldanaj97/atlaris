import { dirname, join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const ROOT_DIR = process.cwd();
const VIRTUAL_FILE_PATH = join(
  ROOT_DIR,
  'tests/__contracts__/plan-query-userid.contract.ts'
);

function readCompilerOptions() {
  const configPath = ts.findConfigFile(
    ROOT_DIR,
    ts.sys.fileExists,
    'tsconfig.json'
  );

  if (!configPath) {
    throw new Error('Could not find tsconfig.json');
  }

  const config = ts.readConfigFile(configPath, ts.sys.readFile);

  if (config.error) {
    throw new Error(
      ts.flattenDiagnosticMessageText(config.error.messageText, '\n')
    );
  }

  return ts.parseJsonConfigFileContent(
    config.config,
    ts.sys,
    dirname(configPath),
    { noEmit: true },
    configPath
  ).options;
}

function compileSnippet(source: string): string[] {
  const compilerOptions = readCompilerOptions();
  const host = ts.createCompilerHost(compilerOptions, true);
  const originalGetSourceFile = host.getSourceFile.bind(host);
  const originalReadFile = host.readFile.bind(host);
  const originalFileExists = host.fileExists.bind(host);

  host.getSourceFile = (
    fileName,
    languageVersion,
    onError,
    shouldCreateNewSourceFile
  ) => {
    if (fileName === VIRTUAL_FILE_PATH) {
      return ts.createSourceFile(fileName, source, languageVersion, true);
    }

    return originalGetSourceFile(
      fileName,
      languageVersion,
      onError,
      shouldCreateNewSourceFile
    );
  };

  host.readFile = (fileName) => {
    if (fileName === VIRTUAL_FILE_PATH) {
      return source;
    }

    return originalReadFile(fileName);
  };

  host.fileExists = (fileName) => {
    if (fileName === VIRTUAL_FILE_PATH) {
      return true;
    }

    return originalFileExists(fileName);
  };

  const program = ts.createProgram([VIRTUAL_FILE_PATH], compilerOptions, host);

  return ts
    .getPreEmitDiagnostics(program)
    .filter((diagnostic) => diagnostic.file?.fileName === VIRTUAL_FILE_PATH)
    .map((diagnostic) =>
      ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')
    );
}

const VALID_CALLS = `
  import {
    getLearningPlanDetail,
    getLightweightPlanSummaries,
    getPlanAttemptsForUser,
    getPlanStatusForUser,
    getPlanSummariesForUser,
  } from '@/lib/db/queries/plans';
  import { getModuleDetail } from '@/lib/db/queries/modules';

  async function probe() {
    const userId = 'user-id';
    await getPlanSummariesForUser(userId);
    await getLightweightPlanSummaries(userId);
    await getLearningPlanDetail('plan-id', userId);
    await getPlanAttemptsForUser('plan-id', userId);
    await getPlanStatusForUser('plan-id', userId);
    await getModuleDetail('module-id', userId);
  }
`;

const MISSING_USER_ID_CALLS = `
  import {
    getLearningPlanDetail,
    getLightweightPlanSummaries,
    getPlanAttemptsForUser,
    getPlanStatusForUser,
    getPlanSummariesForUser,
  } from '@/lib/db/queries/plans';
  import { getModuleDetail } from '@/lib/db/queries/modules';

  async function probe() {
    await getPlanSummariesForUser();
    await getLightweightPlanSummaries();
    await getLearningPlanDetail('plan-id');
    await getPlanAttemptsForUser('plan-id');
    await getPlanStatusForUser('plan-id');
    await getModuleDetail('module-id');
  }
`;

function countMissingArgumentDiagnostics(diagnostics: string[]) {
  return diagnostics.filter(
    (message) =>
      message.includes('Expected') && message.includes('arguments, but got')
  ).length;
}

describe('Plan Queries - Tenant Scoping Guard', () => {
  it('allows calling plan and module read queries when userId is provided', () => {
    expect(compileSnippet(VALID_CALLS)).toHaveLength(0);
  });

  it('rejects plan and module read queries when userId is omitted', () => {
    const diagnostics = compileSnippet(MISSING_USER_ID_CALLS);

    expect(countMissingArgumentDiagnostics(diagnostics)).toBe(6);
  });
});
