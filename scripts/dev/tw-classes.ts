/**
 * Print the CSS Tailwind generates for each class, compiled against
 * src/app/globals.css. A class Tailwind does not know prints "(no CSS)".
 *
 * Usage: pnpm exec tsx scripts/dev/tw-classes.ts type-title 'sm:type-card' text-sm
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type DesignSystem = {
  candidatesToCss(classes: string[]): (string | null)[];
};

type TailwindNode = {
  __unstable__loadDesignSystem(
    css: string,
    options: { base: string },
  ): Promise<DesignSystem>;
};

const STYLESHEET = 'src/app/globals.css';

// @tailwindcss/node is not a direct dependency; resolve it through the
// PostCSS plugin that depends on it, so pnpm's strict layout still finds it.
async function loadTailwindNode(): Promise<TailwindNode> {
  const requireFromHere = createRequire(import.meta.url);
  const requireFromPlugin = createRequire(
    requireFromHere.resolve('@tailwindcss/postcss'),
  );
  const modulePath = requireFromPlugin.resolve('@tailwindcss/node');
  return (await import(pathToFileURL(modulePath).href)) as TailwindNode;
}

async function main(): Promise<void> {
  const classes = process.argv.slice(2);
  if (classes.length === 0) {
    console.error('Usage: pnpm exec tsx scripts/dev/tw-classes.ts <class...>');
    process.exitCode = 1;
    return;
  }

  const stylesheet = path.resolve(STYLESHEET);
  const tailwind = await loadTailwindNode();
  const designSystem = await tailwind.__unstable__loadDesignSystem(
    readFileSync(stylesheet, 'utf8'),
    { base: path.dirname(stylesheet) },
  );

  const results = designSystem.candidatesToCss(classes);
  classes.forEach((className, index) => {
    console.log(`/* ${className} */`);
    console.log(results[index] ?? '(no CSS)');
  });

  if (results.some((css) => css === null)) process.exitCode = 1;
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
