/**
 * Minimal workflow used to verify @workflow/vitest wiring without Testcontainers.
 */
export async function workflowWiringPingWorkflow(
  message: string,
): Promise<{ readonly echo: string }> {
  'use workflow';

  return workflowWiringEchoStep(message);
}

export async function workflowWiringEchoStep(
  message: string,
): Promise<{ readonly echo: string }> {
  'use step';

  return { echo: message };
}
