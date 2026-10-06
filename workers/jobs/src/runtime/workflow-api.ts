// Wrangler alias target for `workflow/api` (Vercel Workflow SDK). See
// ./workflow.ts: the Worker never starts or reads Vercel workflow runs.

export async function start(): Promise<never> {
  throw new Error(
    'Vercel Workflow SDK `start` is not available on the jobs Worker.',
  );
}

export async function getRun(): Promise<never> {
  throw new Error(
    'Vercel Workflow SDK `getRun` is not available on the jobs Worker.',
  );
}
