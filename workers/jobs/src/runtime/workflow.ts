// Wrangler alias target for `workflow` (Vercel Workflow SDK). The Worker
// bundles modules that import the SDK but never calls their Vercel paths; it
// runs domain functions and injects its own starters instead (design note,
// Runtime compatibility audit). Any call here is a wiring bug and fails loudly.

function unavailable(name: string): never {
  throw new Error(
    `Vercel Workflow SDK \`${name}\` is not available on the jobs Worker.`,
  );
}

export class FatalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FatalError';
  }
}

export class RetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RetryableError';
  }
}

export function getWorkflowMetadata(): never {
  return unavailable('getWorkflowMetadata');
}

export function getStepMetadata(): never {
  return unavailable('getStepMetadata');
}
