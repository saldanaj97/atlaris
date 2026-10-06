// Wrangler alias target for `@flags-sdk/vercel`. `src/flags.ts` builds an
// adapter at import time; the `flags/next` alias (./flags-next.ts) never
// consults it, so this adapter must never be asked to decide.
export function vercelAdapter(): { decide: () => never } {
  return {
    decide: () => {
      throw new Error('Vercel Flags are not available on the jobs Worker.');
    },
  };
}
