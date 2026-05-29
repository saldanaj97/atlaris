import { WORKFLOW_CALLBACK_TOKEN_HEADER } from '@/lib/proxy/workflow-callback-auth';
import { resolveWorkflowCallbackProxyAccess } from '@/lib/proxy/workflow-callback-proxy';
import { describe, expect, it } from 'vitest';

const baseConfig = {
  isProduction: false,
  isHostedVercelDeploy: false,
  callbackToken: undefined,
} as const;

function createHeaders(values: Record<string, string> = {}): Headers {
  return new Headers(values);
}

describe('resolveWorkflowCallbackProxyAccess', () => {
  it('maps policy outcomes to proxy status codes', async () => {
    expect(
      await resolveWorkflowCallbackProxyAccess(
        {
          method: 'POST',
          pathname: '/.well-known/workflow/v1/flow',
          searchParams: new URLSearchParams(),
          headers: createHeaders({
            'x-vqs-queue-name': '__wkf_workflow_default',
            'x-vqs-message-id': 'msg_123',
            'x-vqs-message-attempt': '1',
          }),
        },
        baseConfig,
      ),
    ).toBe('allow');

    expect(
      await resolveWorkflowCallbackProxyAccess(
        {
          method: 'POST',
          pathname: '/.well-known/workflow/v1/flow',
          searchParams: new URLSearchParams(),
          headers: createHeaders(),
        },
        baseConfig,
      ),
    ).toBe('deny');

    expect(
      await resolveWorkflowCallbackProxyAccess(
        {
          method: 'POST',
          pathname: '/.well-known/workflow/v1/flow',
          searchParams: new URLSearchParams(),
          headers: createHeaders(),
        },
        { ...baseConfig, isProduction: true },
      ),
    ).toBe('misconfigured');
  });

  it('accepts trimmed custom callback header tokens', async () => {
    expect(
      await resolveWorkflowCallbackProxyAccess(
        {
          method: 'POST',
          pathname: '/.well-known/workflow/v1/flow',
          searchParams: new URLSearchParams(),
          headers: createHeaders({
            [WORKFLOW_CALLBACK_TOKEN_HEADER]: '  secret-token  ',
          }),
        },
        { ...baseConfig, callbackToken: 'secret-token' },
      ),
    ).toBe('allow');
  });
});
