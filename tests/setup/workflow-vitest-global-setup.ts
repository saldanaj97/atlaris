import { BaseBuilder, createBaseBuilderConfig } from '@workflow/builders';
import { initDataDir } from '@workflow/world-local';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const outDir = join(process.cwd(), '.workflow-vitest');
const dataDir = join(process.cwd(), '.workflow-data');

const workflowDirs = process.env.WORKFLOW_VITEST_DIRS?.split(',').map((dir) =>
  dir.trim(),
) ?? ['tests/helpers/workflow'];

/**
 * Matches @workflow/vitest's builder, with configurable discovery roots.
 * Default scope is test-only wiring workflows so `steps.mjs` does not pull
 * production step dependencies during smoke runs.
 */
class ScopedVitestWorkflowBuilder extends BaseBuilder {
  constructor(workingDir: string) {
    super({
      ...createBaseBuilderConfig({
        workingDir,
        dirs: workflowDirs,
      }),
      buildTarget: 'next',
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
    await mkdir(outDir, { recursive: true });
    await this.createWorkflowsBundle({
      outfile: join(outDir, 'workflows.mjs'),
      bundleFinalOutput: false,
      format: 'esm',
      inputFiles,
    });
    await this.createStepsBundle({
      outfile: join(outDir, 'steps.mjs'),
      externalizeNonSteps: true,
      rewriteTsExtensions: true,
      format: 'esm',
      inputFiles,
    });
  }
}

export async function setup(): Promise<void> {
  const builder = new ScopedVitestWorkflowBuilder(process.cwd());
  await builder.build();
  await initDataDir(dataDir);
}
