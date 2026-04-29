'use client';

import { Button } from '@/components/ui/button';
import { createCheckoutResponseSchema } from '@/features/billing/validation/stripe';
import {
  clientErrorFieldsFromParsedApi,
  parseApiErrorUnlessOk,
  readResponseJsonBody,
} from '@/lib/api/client-response-body';
import { isAbortError } from '@/lib/errors';
import { clientLogger } from '@/lib/logging/client';
import type { ReactElement } from 'react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';

type CheckoutRequestResult =
  | { kind: 'success'; sessionUrl: string }
  | { kind: 'error'; message: string; error: unknown };

interface SubscribeButtonProps {
  priceId: string;
  label?: string;
  variant?: 'default' | 'outline' | 'secondary';
  className?: string;
  successUrl?: string;
  cancelUrl?: string;
}

function getErrorMessage(error: unknown, fallbackMessage: string): string {
  return error instanceof Error ? error.message : fallbackMessage;
}

function getCheckoutResponseErrorMessage(rawIssue: {
  code?: string;
  message?: string;
  path?: readonly PropertyKey[];
}): string {
  if (
    rawIssue.path?.[0] === 'sessionUrl' &&
    (rawIssue.code === 'invalid_type' ||
      rawIssue.message === 'sessionUrl is required')
  ) {
    return 'Missing session URL';
  }

  return rawIssue.message ?? 'Invalid checkout response';
}

const CHECKOUT_TIMEOUT_MS = 15_000;

async function requestCheckoutSession(params: {
  priceId: string;
  successUrl?: string;
  cancelUrl?: string;
}): Promise<CheckoutRequestResult> {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => {
    controller.abort();
  }, CHECKOUT_TIMEOUT_MS);

  const responseResult = await fetch('/api/v1/stripe/create-checkout', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      priceId: params.priceId,
      successUrl: params.successUrl,
      cancelUrl: params.cancelUrl,
    }),
    signal: controller.signal,
  })
    .then((response) => {
      globalThis.clearTimeout(timeoutId);
      return { kind: 'response' as const, response };
    })
    .catch((error: unknown) => {
      globalThis.clearTimeout(timeoutId);
      return { kind: 'network-error' as const, error };
    });

  if (responseResult.kind === 'network-error') {
    const timedOut = isAbortError(responseResult.error);
    return {
      kind: 'error',
      message: timedOut
        ? 'Request timed out — please try again'
        : getErrorMessage(responseResult.error, 'Something went wrong'),
      error: responseResult.error,
    };
  }

  const { response } = responseResult;

  const apiError = await parseApiErrorUnlessOk(
    response,
    'Failed to start checkout',
  );
  if (apiError !== null) {
    return {
      kind: 'error',
      ...clientErrorFieldsFromParsedApi(apiError),
    };
  }

  const bodyResult = await readResponseJsonBody(response);

  if (bodyResult.kind === 'parse-error') {
    return {
      kind: 'error',
      message: 'Invalid checkout response',
      error: bodyResult.error,
    };
  }

  const parsed = createCheckoutResponseSchema.safeParse(bodyResult.raw);
  if (!parsed.success) {
    const message = getCheckoutResponseErrorMessage(
      parsed.error.issues[0] ?? {},
    );

    return {
      kind: 'error',
      message,
      error: parsed.error,
    };
  }

  return {
    kind: 'success',
    sessionUrl: parsed.data.sessionUrl,
  };
}

export default function SubscribeButton({
  priceId,
  label = 'Subscribe',
  variant = 'default',
  className,
  successUrl,
  cancelUrl,
}: SubscribeButtonProps): ReactElement {
  const [loading, setLoading] = useState(false);
  const pendingRef = useRef(false);

  async function handleClick() {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setLoading(true);

    const result = await requestCheckoutSession({
      priceId,
      successUrl,
      cancelUrl,
    });

    if (result.kind === 'error') {
      clientLogger.error('Failed to start checkout', {
        cancelUrl,
        error: result.error,
        priceId,
        successUrl,
      });
      toast.error('Unable to start checkout', { description: result.message });
      setLoading(false);
      pendingRef.current = false;
      return;
    }

    try {
      window.location.href = result.sessionUrl;
    } catch (error: unknown) {
      clientLogger.error('Failed to redirect to checkout', {
        cancelUrl,
        error,
        priceId,
        sessionUrl: result.sessionUrl,
        successUrl,
      });
      toast.error('Unable to redirect to checkout', {
        description: getErrorMessage(error, 'Please try again.'),
      });
      setLoading(false);
      pendingRef.current = false;
    }
  }

  return (
    <Button
      variant={variant}
      className={className}
      disabled={loading}
      onClick={() => {
        void handleClick();
      }}
    >
      {loading ? 'Redirecting…' : label}
    </Button>
  );
}
