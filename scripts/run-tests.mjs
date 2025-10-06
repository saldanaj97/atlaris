#!/usr/bin/env node

import { config } from 'dotenv';
import { spawnSync } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';

const projectRoot = resolve(new URL('..', import.meta.url).pathname);

// Load .env.test before checking DATABASE_URL
config({ path: join(projectRoot, '.env.test') });

if (!process.env.DATABASE_URL) {
  console.error('Missing DATABASE_URL (expected from .env.test or CI env)');
  process.exit(1);
}

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
  const result = spawnSync('pnpm', args, {
    cwd: projectRoot,
    stdio: 'inherit',
  });
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

const srcSpecs = (await collectSpecs('src')).filter((spec) =>
  spec.includes(`${sep}__tests__${sep}`)
);
for (const spec of srcSpecs) {
  runCommand(['vitest', 'run', spec], `Running ${spec}`);
}

console.log('\n✓ Full test suite completed successfully');
