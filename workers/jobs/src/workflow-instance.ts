/** Instance states that never run again. */
const TERMINAL_INSTANCE_STATUSES: readonly string[] = [
  'errored',
  'terminated',
  'complete',
];

export type ExistingInstance = { readonly terminal: boolean };

/**
 * Looks up a Workflow instance by ID. Returns `null` when none exists. An
 * existing instance whose status cannot be read counts as live, so callers
 * never treat it as abandoned on a guess.
 */
export async function findInstance(
  workflow: Pick<Workflow, 'get'>,
  instanceId: string,
): Promise<ExistingInstance | null> {
  let instance: WorkflowInstance;
  try {
    instance = await workflow.get(instanceId);
  } catch {
    return null;
  }
  try {
    const { status } = await instance.status();
    return { terminal: TERMINAL_INSTANCE_STATUSES.includes(status) };
  } catch {
    return { terminal: false };
  }
}
