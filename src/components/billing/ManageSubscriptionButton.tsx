'use client';

import { useRef, useState, type ReactElement } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { parseApiErrorResponse } from '@/lib/api/error-response';
import { clientLogger } from '@/lib/logging/client';
import { createPortalResponseSchema } from '@/lib/validation/stripe';

const PORTAL_TIMEOUT_MS = 15_000;

type PortalRequestResult =
  | { kind: 'success'; portalUrl: string }
  | {
      kind: 'error';
      message: string;
      error: unknown;
      reason:
        | 'timeout'
        | 'api'
        | 'invalid-response'
        | 'invalid-url'
        | 'network';
    };

function isTimeoutError(error: unknown): error is DOMException {
  return error instanceof DOMException && error.name === 'TimeoutError';
}

function getErrorMessage(error: unknown, fallbackMessage: string): string {
  return error instanceof Error ? error.message : fallbackMessage;
}

async function requestBillingPortal(params: {
  returnUrl?: string;
}): Promise<PortalRequestResult> {
  const responseResult = await fetch('/api/v1/stripe/create-portal', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ returnUrl: params.returnUrl }),
    signal: AbortSignal.timeout(PORTAL_TIMEOUT_MS),
  })
    .then((response) => ({ kind: 'response' as const, response }))
    .catch((error: unknown) => ({ kind: 'network-error' as const, error }));

  if (responseResult.kind === 'network-error') {
    return {
      kind: 'error',
      message: isTimeoutError(responseResult.error)
        ? 'Request timed out — please try again'
        : getErrorMessage(responseResult.error, 'Something went wrong'),
      error: responseResult.error,
      reason: isTimeoutError(responseResult.error) ? 'timeout' : 'network',
    };
  }

  const { response } = responseResult;

  if (!response.ok) {
    const parsedError = await parseApiErrorResponse(
      response,
      'Failed to open billing portal'
    );
    return {
      kind: 'error',
      message: parsedError.error,
      error: new Error(parsedError.error),
      reason: 'api',
    };
  }

  const bodyResult = await response
    .json()
    .then((raw: unknown) => ({ kind: 'body' as const, raw }))
    .catch((error: unknown) => ({ kind: 'parse-error' as const, error }));

  if (bodyResult.kind === 'parse-error') {
    return {
      kind: 'error',
      message: 'Invalid billing portal response',
      error: bodyResult.error,
      reason: 'invalid-response',
    };
  }

  const parsed = createPortalResponseSchema.safeParse(bodyResult.raw);
  if (!parsed.success) {
    const portalUrlIssue = parsed.error.issues.find(
      (issue) => issue.path[0] === 'portalUrl'
    );
    return {
      kind: 'error',
      message:
        portalUrlIssue?.message ??
        parsed.error.issues[0]?.message ??
        'Invalid billing portal response',
      error: parsed.error,
      reason: 'invalid-response',
    };
  }

  const portalUrl = new URL(parsed.data.portalUrl);
  if (portalUrl.protocol !== 'http:' && portalUrl.protocol !== 'https:') {
    return {
      kind: 'error',
      message: 'Invalid billing portal URL protocol.',
      error: new Error('Invalid billing portal URL protocol.'),
      reason: 'invalid-url',
    };
  }

  return {
    kind: 'success',
    portalUrl: portalUrl.toString(),
  };
}

interface ManageSubscriptionButtonProps {
  label?: string;
  className?: string;
  returnUrl?: string;
}

export default function ManageSubscriptionButton({
  label = 'Manage Subscription',
  className,
  returnUrl,
}: ManageSubscriptionButtonProps): ReactElement {
  const [loading, setLoading] = useState(false);
  const pendingRef = useRef(false);

  async function handleClick() {
    if (pendingRef.current) {
      return;
    }

    pendingRef.current = true;
    setLoading(true);

    const result = await requestBillingPortal({ returnUrl });

    if (result.kind === 'error') {
      if (result.reason === 'timeout') {
        clientLogger.warn('Billing portal request timed out', { returnUrl });
      } else {
        clientLogger.error('Failed to open billing portal', {
          error: result.error,
          returnUrl,
        });
      }

      toast.error('Unable to open billing portal', {
        description: result.message,
      });
      setLoading(false);
      pendingRef.current = false;
      return;
    }

    window.location.href = result.portalUrl;
  }

  return (
    <Button
      className={className}
      disabled={loading}
      onClick={() => {
        void handleClick();
      }}
    >
      {loading ? 'Opening…' : label}
    </Button>
  );
}
