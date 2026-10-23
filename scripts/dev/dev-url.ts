import { execFileSync } from 'node:child_process';

/** The running dev server's URL: `explicit` when given, else `portless get atlaris` (worktree-aware). */
export function resolveDevBaseUrl(explicit?: string): string {
  if (explicit) return explicit.replace(/\/$/, '');
  // portless refuses to run when it sees pnpm/npm launcher variables.
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith('npm_')) delete env[key];
  }
  try {
    return execFileSync('portless', ['get', 'atlaris'], {
      encoding: 'utf8',
      env,
    })
      .trim()
      .replace(/\/$/, '');
  } catch {
    throw new Error('Could not resolve the dev URL; pass --base <url>.');
  }
}
