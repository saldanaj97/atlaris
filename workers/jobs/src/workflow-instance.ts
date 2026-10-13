/** Instance states that never run again (`rollingBack` only finishes a termination). */
const TERMINAL_INSTANCE_STATUSES: readonly string[] = [
  'errored',
  'terminated',
  'complete',
  'rollingBack',
];

export type ExistingInstance = {
  readonly terminal: boolean;
  /** The Workflow's return value once it has completed. */
  readonly output?: unknown;
};

/**
 * True for a module lessons instance that completed with a `success` outcome.
 * A `complete` instance can also be a handled failure, so status alone is not
 * enough to keep a claim.
 */
export function moduleLessonsInstanceSucceeded(
  instance: ExistingInstance,
): boolean {
  const output = instance.output;
  return (
    typeof output === 'object' &&
    output !== null &&
    'kind' in output &&
    output.kind === 'success'
  );
}

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
    const { status, output } = await instance.status();
    return { terminal: TERMINAL_INSTANCE_STATUSES.includes(status), output };
  } catch {
    return { terminal: false };
  }
}
