import type {
  WorkflowCallbackAuthConfig,
  WorkflowCallbackAuthInput,
  WorkflowCallbackAuthResult,
} from '@/lib/proxy/workflow-callback-auth';

import { resolveWorkflowCallbackAccess } from '@/lib/proxy/workflow-callback-auth';

export type WorkflowCallbackProxyStatus = WorkflowCallbackAuthResult['status'];

export type WorkflowCallbackProxyConfig = WorkflowCallbackAuthConfig;

/**
 * Resolves workflow callback access for proxy middleware. Pure policy wrapper for tests.
 */
export async function resolveWorkflowCallbackProxyAccess(
  input: WorkflowCallbackAuthInput,
  config: WorkflowCallbackProxyConfig,
): Promise<WorkflowCallbackProxyStatus> {
  const result = await resolveWorkflowCallbackAccess(input, config);
  return result.status;
}
