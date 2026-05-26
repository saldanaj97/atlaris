'use client';

import type { ReactElement } from 'react';

import {
  getClientErrorMessage,
  requestPostJson,
} from '@/app/_shared/client-api';
import { Button } from '@/components/ui/button';
import { createCheckoutResponseSchema } from '@/features/billing/validation/stripe';
import { clientLogger } from '@/lib/logging/client';
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

function getCheckoutResponseErrorMessage(rawIssue: {
  code?: string;
  message?: string;
  path?: readonly PropertyKey[];
}): string | undefined {
  if (
    rawIssue.path?.[0] === 'sessionUrl' &&
    (rawIssue.code === 'invalid_type' ||
      rawIssue.message === 'sessionUrl is required')
  ) {
    return 'Missing session URL';
  }

  return undefined;
}

const CHECKOUT_TIMEOUT_MS = 15_000;

async function requestCheckoutSession(params: {
  priceId: string;
  successUrl?: string;
  cancelUrl?: string;
}): Promise<CheckoutRequestResult> {
  const result = await requestPostJson({
    url: '/api/v1/stripe/create-checkout',
    body: {
      priceId: params.priceId,
      successUrl: params.successUrl,
      cancelUrl: params.cancelUrl,
    },
    schema: createCheckoutResponseSchema,
    fallbackMessage: 'Failed to start checkout',
    timeoutMs: CHECKOUT_TIMEOUT_MS,
    mapSchemaError: getCheckoutResponseErrorMessage,
  });

  if (result.kind === 'error') {
    return result;
  }

  return {
    kind: 'success',
    sessionUrl: result.data.sessionUrl,
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
        description: getClientErrorMessage(error, 'Please try again.'),
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
      aria-busy={loading}
      onClick={() => {
        void handleClick();
      }}
    >
      {loading ? 'Redirecting…' : label}
    </Button>
  );
}
