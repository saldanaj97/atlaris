import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export type PhaseResult = { label: string; exitCode: number };
export type PhaseRunner = (phase: string) => Promise<number>;

export function runPnpmScript(script: string): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn('pnpm', ['run', script], {
      stdio: 'inherit',
      env: process.env,
    });

    child.on('close', (code) => {
      resolve(code ?? 1);
    });

    child.on('error', () => {
      resolve(1);
    });
  });
}

/**
 * Run every phase and retain each exit code so later phases still execute.
 *
 * A few callers use this for independent validation/test phases where the
 * aggregate result matters more than short-circuiting after the first failure.
 */
export async function runPhases(
  phases: readonly string[],
  runPhase: PhaseRunner = runPnpmScript,
): Promise<PhaseResult[]> {
  const results: PhaseResult[] = [];

  for (const phase of phases) {
    console.log(`\n>>> Running ${phase}...\n`);
    const exitCode = await runPhase(phase);
    results.push({ label: phase, exitCode });
  }

  const passed = results
    .filter((result) => result.exitCode === 0)
    .map((result) => result.label);
  const failed = results
    .filter((result) => result.exitCode !== 0)
    .map((result) => result.label);

  console.log('');

  if (passed.length > 0) {
    console.log(`Passed: ${passed.join(' ')}`);
  }

  if (failed.length > 0) {
    console.log(`Failed: ${failed.join(' ')}`);
  }

  return results;
}

export function aggregateExitCode(results: readonly PhaseResult[]): number {
  return results.some((result) => result.exitCode !== 0) ? 1 : 0;
}

async function main(): Promise<void> {
  const phases = process.argv.slice(2);

  if (phases.length === 0) {
    console.error('Usage: tsx scripts/tests/run-phases.ts <pnpm-script> [...]');
    process.exitCode = 1;
    return;
  }

  const results = await runPhases(phases);
  process.exitCode = aggregateExitCode(results);
}

function isDirectExecution(): boolean {
  const entrypoint = process.argv[1];
  return (
    entrypoint !== undefined &&
    import.meta.url === pathToFileURL(entrypoint).href
  );
}

if (isDirectExecution()) {
  void main();
}
