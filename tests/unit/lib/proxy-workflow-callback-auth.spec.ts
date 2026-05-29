import {
  hasLocalWorldQueueHeaders,
  isWorkflowCallbackPath,
  isWorkflowHealthCheck,
  readWorkflowCallbackToken,
  resolveWorkflowCallbackAccess,
  WORKFLOW_CALLBACK_TOKEN_HEADER,
  workflowCallbackTokensMatch,
} from '@/lib/proxy/workflow-callback-auth';
import { describe, expect, it } from 'vitest';

const baseConfig = {
  isProduction: false,
  isHostedVercelDeploy: false,
  callbackToken: undefined,
} as const;

function createHeaders(values: Record<string, string> = {}): Headers {
  return new Headers(values);
}

describe('workflow callback auth', () => {
  it('detects workflow callback paths', () => {
    expect(isWorkflowCallbackPath('/.well-known/workflow/v1/flow')).toBe(true);
    expect(isWorkflowCallbackPath('/.well-known/workflow/v1/step')).toBe(true);
    expect(isWorkflowCallbackPath('/.well-known/vercel/flags')).toBe(false);
  });

  it('allows workflow health checks in non-production', async () => {
    expect(
      await resolveWorkflowCallbackAccess(
        {
          method: 'HEAD',
          pathname: '/.well-known/workflow/v1/flow',
          searchParams: new URLSearchParams('__health'),
          headers: createHeaders(),
        },
        baseConfig,
      ),
    ).toEqual({ status: 'allow' });

    expect(
      await resolveWorkflowCallbackAccess(
        {
          method: 'POST',
          pathname: '/.well-known/workflow/v1/flow',
          searchParams: new URLSearchParams('__health'),
          headers: createHeaders(),
        },
        baseConfig,
      ),
    ).toEqual({ status: 'deny' });
  });

  it('requires token for health checks in self-hosted production', async () => {
    const config = {
      ...baseConfig,
      isProduction: true,
      callbackToken: 'secret-token',
    };

    expect(
      await resolveWorkflowCallbackAccess(
        {
          method: 'HEAD',
          pathname: '/.well-known/workflow/v1/flow',
          searchParams: new URLSearchParams('__health'),
          headers: createHeaders(),
        },
        config,
      ),
    ).toEqual({ status: 'deny' });

    expect(
      await resolveWorkflowCallbackAccess(
        {
          method: 'HEAD',
          pathname: '/.well-known/workflow/v1/flow',
          searchParams: new URLSearchParams('__health'),
          headers: createHeaders({
            authorization: 'Bearer secret-token',
          }),
        },
        config,
      ),
    ).toEqual({ status: 'allow' });
  });

  it('allows webhook resume routes without callback token auth', async () => {
    expect(
      await resolveWorkflowCallbackAccess(
        {
          method: 'POST',
          pathname: '/.well-known/workflow/v1/webhook/resume-token',
          searchParams: new URLSearchParams(),
          headers: createHeaders(),
        },
        baseConfig,
      ),
    ).toEqual({ status: 'allow' });
  });

  it('allows Vercel-hosted callbacks without a configured token', async () => {
    expect(
      await resolveWorkflowCallbackAccess(
        {
          method: 'POST',
          pathname: '/.well-known/workflow/v1/flow',
          searchParams: new URLSearchParams(),
          headers: createHeaders(),
        },
        { ...baseConfig, isProduction: true, isHostedVercelDeploy: true },
      ),
    ).toEqual({ status: 'allow' });
  });

  it('requires a matching token when configured', async () => {
    const config = {
      ...baseConfig,
      callbackToken: 'secret-token',
    };

    expect(
      await resolveWorkflowCallbackAccess(
        {
          method: 'POST',
          pathname: '/.well-known/workflow/v1/flow',
          searchParams: new URLSearchParams(),
          headers: createHeaders({
            authorization: 'Bearer secret-token',
          }),
        },
        config,
      ),
    ).toEqual({ status: 'allow' });

    expect(
      await resolveWorkflowCallbackAccess(
        {
          method: 'POST',
          pathname: '/.well-known/workflow/v1/step',
          searchParams: new URLSearchParams(),
          headers: createHeaders({
            [WORKFLOW_CALLBACK_TOKEN_HEADER]: 'secret-token',
          }),
        },
        config,
      ),
    ).toEqual({ status: 'allow' });

    expect(
      await resolveWorkflowCallbackAccess(
        {
          method: 'POST',
          pathname: '/.well-known/workflow/v1/flow',
          searchParams: new URLSearchParams(),
          headers: createHeaders(),
        },
        config,
      ),
    ).toEqual({ status: 'deny' });
  });

  it('rejects requests that supply both bearer and custom callback tokens', async () => {
    expect(
      await resolveWorkflowCallbackAccess(
        {
          method: 'POST',
          pathname: '/.well-known/workflow/v1/flow',
          searchParams: new URLSearchParams(),
          headers: createHeaders({
            authorization: 'Bearer secret-token',
            [WORKFLOW_CALLBACK_TOKEN_HEADER]: 'secret-token',
          }),
        },
        { ...baseConfig, callbackToken: 'secret-token' },
      ),
    ).toEqual({ status: 'deny' });
  });

  it('allows local-world queue callbacks in non-production without a token', async () => {
    expect(
      await resolveWorkflowCallbackAccess(
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
    ).toEqual({ status: 'allow' });
  });

  it('denies forged local callback POSTs without queue headers or token', async () => {
    expect(
      await resolveWorkflowCallbackAccess(
        {
          method: 'POST',
          pathname: '/.well-known/workflow/v1/flow',
          searchParams: new URLSearchParams(),
          headers: createHeaders(),
        },
        baseConfig,
      ),
    ).toEqual({ status: 'deny' });

    expect(
      await resolveWorkflowCallbackAccess(
        {
          method: 'POST',
          pathname: '/.well-known/workflow/v1/step',
          searchParams: new URLSearchParams(),
          headers: createHeaders(),
        },
        baseConfig,
      ),
    ).toEqual({ status: 'deny' });
  });

  it('fails closed in non-Vercel production when no token is configured', async () => {
    expect(
      await resolveWorkflowCallbackAccess(
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
        { ...baseConfig, isProduction: true },
      ),
    ).toEqual({ status: 'misconfigured' });
  });

  it('parses callback tokens from bearer or custom header only', () => {
    const headers = createHeaders({
      authorization: 'Bearer bearer-token',
    });
    expect(readWorkflowCallbackToken(headers)).toBe('bearer-token');

    const customHeaders = createHeaders({
      [WORKFLOW_CALLBACK_TOKEN_HEADER]: 'custom-token',
    });
    expect(readWorkflowCallbackToken(customHeaders)).toBe('custom-token');
  });

  it('matches callback tokens with timing-safe equality', async () => {
    expect(await workflowCallbackTokensMatch('secret', 'secret')).toBe(true);
    expect(await workflowCallbackTokensMatch('secret', 'other')).toBe(false);
    expect(await workflowCallbackTokensMatch('secret', 'secre')).toBe(false);
  });

  it('detects local-world queue headers', () => {
    expect(
      hasLocalWorldQueueHeaders(
        createHeaders({
          'x-vqs-queue-name': '__wkf_step_default',
          'x-vqs-message-id': 'msg_123',
          'x-vqs-message-attempt': '1',
        }),
      ),
    ).toBe(true);
    expect(
      hasLocalWorldQueueHeaders(
        createHeaders({
          'x-vqs-queue-name': '__wkf_step_default',
        }),
      ),
    ).toBe(false);
  });

  it('recognizes health-check methods', () => {
    expect(
      isWorkflowHealthCheck({
        method: 'GET',
        searchParams: new URLSearchParams('__health'),
      }),
    ).toBe(true);
    expect(
      isWorkflowHealthCheck({
        method: 'POST',
        searchParams: new URLSearchParams('__health'),
      }),
    ).toBe(false);
  });
});
