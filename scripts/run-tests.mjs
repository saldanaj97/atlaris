#!/usr/bin/env node

import { readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const projectRoot = resolve(new URL('..', import.meta.url).pathname);

async function collectSpecs(relativeDir) {
  const results = [];
  async function walk(current, base) {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath, join(base, entry.name));
        continue;
      }
      if (entry.name.endsWith('.spec.ts') || entry.name.endsWith('.test.ts')) {
        results.push(join(base, entry.name));
      }
    }
  }
  const absolute = resolve(projectRoot, relativeDir);
  await walk(absolute, relativeDir);
  results.sort((a, b) => a.localeCompare(b));
  return results;
}

function runCommand(args, label) {
  console.log(`\n▶ ${label}`);
  const result = spawnSync('pnpm', args, { cwd: projectRoot, stdio: 'inherit' });
  if (typeof result.status === 'number' && result.status !== 0) {
    process.exit(result.status === null ? 1 : result.status);
  }
}

runCommand(['vitest', 'run', 'tests/unit'], 'Running unit tests');

const contractSpecs = await collectSpecs('tests/contract');
for (const spec of contractSpecs) {
  runCommand(['vitest', 'run', spec], `Running ${spec}`);
}

const integrationSpecs = await collectSpecs('tests/integration');
for (const spec of integrationSpecs) {
  runCommand(['vitest', 'run', spec], `Running ${spec}`);
}

console.log('\n✓ Full test suite completed successfully');
