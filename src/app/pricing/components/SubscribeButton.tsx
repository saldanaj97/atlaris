'use client';

import { Button } from '@/components/ui/button';
import { useRef, useState } from 'react';
import type { ReactElement } from 'react';

import { parseApiErrorResponse } from '@/lib/api/error-response';
import { clientLogger } from '@/lib/logging/client';
import { createCheckoutResponseSchema } from '@/lib/validation/stripe';
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

async function requestCheckoutSession(params: {
  priceId: string;
  successUrl?: string;
  cancelUrl?: string;
}): Promise<CheckoutRequestResult> {
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
  })
    .then((response) => ({ kind: 'response' as const, response }))
    .catch((error: unknown) => ({ kind: 'network-error' as const, error }));

  if (responseResult.kind === 'network-error') {
    return {
      kind: 'error',
      message: getErrorMessage(responseResult.error, 'Something went wrong'),
      error: responseResult.error,
    };
  }

  const { response } = responseResult;

  if (!response.ok) {
    const parsedError = await parseApiErrorResponse(
      response,
      'Failed to start checkout'
    );
    return {
      kind: 'error',
      message: parsedError.error,
      error: new Error(parsedError.error),
    };
  }

  const bodyResult = await response
    .json()
    .then((raw: unknown) => ({ kind: 'body' as const, raw }))
    .catch((error: unknown) => ({ kind: 'parse-error' as const, error }));

  if (bodyResult.kind === 'parse-error') {
    return {
      kind: 'error',
      message: 'Invalid checkout response',
      error: bodyResult.error,
    };
  }

  const parsed = createCheckoutResponseSchema.safeParse(bodyResult.raw);
  if (!parsed.success) {
    const missingSessionUrl = parsed.error.issues.some(
      (issue) => issue.path[0] === 'sessionUrl'
    );
    const message = missingSessionUrl
      ? 'Missing session URL'
      : (parsed.error.issues[0]?.message ?? 'Invalid checkout response');

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

    window.location.href = result.sessionUrl;
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
