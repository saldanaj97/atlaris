import { spawn } from 'node:child_process';

type PhaseResult = { label: string; exitCode: number };

function runPnpmScript(script: string): Promise<number> {
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

async function main(): Promise<void> {
  const scripts = process.argv.slice(2);

  if (scripts.length === 0) {
    console.error('Usage: tsx scripts/tests/run-phases.ts <pnpm-script> [...]');
    process.exitCode = 1;
    return;
  }

  const results: PhaseResult[] = [];

  for (const script of scripts) {
    console.log(`\n>>> Running ${script}...\n`);
    const exitCode = await runPnpmScript(script);
    results.push({ label: script, exitCode });
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
    process.exitCode = 1;
  }
}

main();
