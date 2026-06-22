import {
  setup as setupTestcontainers,
  teardown as teardownTestcontainers,
} from './testcontainers';
import { BaseBuilder, createBaseBuilderConfig } from '@workflow/builders';
import { initDataDir } from '@workflow/world-local';
import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const outDir = join(process.cwd(), '.workflow-vitest');
const dataDir = join(process.cwd(), '.workflow-data');

const defaultWorkflowDirs = [
  'src/features/lesson-content/workflows',
  'src/features/plans/workflows',
  'tests/helpers/workflow',
];
const workflowDirs =
  process.env.WORKFLOW_VITEST_DIRS?.split(',')
    .map((dir) => dir.trim())
    .filter(Boolean) ?? defaultWorkflowDirs;

/**
 * Matches @workflow/vitest's builder, with configurable discovery roots.
 * The default scope covers every production workflow plus the wiring helper.
 */
class ScopedVitestWorkflowBuilder extends BaseBuilder {
  constructor(workingDir: string) {
    const packageJson = JSON.parse(
      readFileSync(join(workingDir, 'package.json'), 'utf8'),
    ) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const externalPackages = [
      ...Object.keys(packageJson.dependencies ?? {}),
      ...Object.keys(packageJson.devDependencies ?? {}),
    ];

    super({
      ...createBaseBuilderConfig({
        workingDir,
        dirs: workflowDirs,
      }),
      buildTarget: 'next',
      // Bundle project files so aliases resolve in the step worker, but let
      // Node load package dependencies directly (some contain dynamic require).
      externalPackages,
      suppressCreateWorkflowsBundleLogs: true,
      suppressCreateWebhookBundleLogs: true,
      suppressCreateManifestLogs: true,
    });
  }

  get shouldLogBaseBuilderInfo(): boolean {
    return false;
  }

  async build(): Promise<void> {
    const inputFiles = await this.getInputFiles();
    const tsconfigPath = await this.findTsConfigPath();
    await mkdir(outDir, { recursive: true });
    await this.createWorkflowsBundle({
      outfile: join(outDir, 'workflows.mjs'),
      bundleFinalOutput: false,
      format: 'esm',
      inputFiles,
      tsconfigPath,
    });
    await this.createStepsBundle({
      outfile: join(outDir, 'steps.mjs'),
      externalizeNonSteps: false,
      rewriteTsExtensions: true,
      format: 'esm',
      inputFiles,
      tsconfigPath,
    });
  }
}

export async function setup(): Promise<void> {
  await setupTestcontainers();
  const builder = new ScopedVitestWorkflowBuilder(process.cwd());
  await builder.build();
  await initDataDir(dataDir);
}

export async function teardown(): Promise<void> {
  await teardownTestcontainers();
}
