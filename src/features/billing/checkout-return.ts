export const CHECKOUT_RETURN_QUERY_PARAM = 'checkout';
export const CHECKOUT_RETURN_QUERY_VALUE = '1';
export const CHECKOUT_BASELINE_QUERY_PARAM = 'checkoutBaseline';

export const CHECKOUT_SYNC_POLL_INTERVAL_MS = 2000;
export const CHECKOUT_SYNC_TIMEOUT_MS = 30_000;

export const CHECKOUT_SYNC_UPDATING_MESSAGE = 'Updating your subscription...';
export const CHECKOUT_SYNC_TIMEOUT_MESSAGE =
  'Your subscription update is still processing. Refresh this page in a moment, or try again from Settings.';

export type CheckoutBillingSignatureInput = {
  tier: string;
  status: string | null;
  periodEnd: string | null;
  cancelAtPeriodEnd: boolean;
};

export function buildCheckoutReturnRedirectUrl(
  settingsRoot: string,
  baselineSignature?: string | null,
): string {
  const query = new URLSearchParams({
    [CHECKOUT_RETURN_QUERY_PARAM]: CHECKOUT_RETURN_QUERY_VALUE,
  });
  if (baselineSignature) {
    query.set(CHECKOUT_BASELINE_QUERY_PARAM, baselineSignature);
  }

  return `${settingsRoot}?${query.toString()}#billing`;
}

export function isCheckoutReturnQueryValue(
  value: string | null | undefined,
): boolean {
  return value === CHECKOUT_RETURN_QUERY_VALUE;
}

export function buildCheckoutBillingSignature(
  input: CheckoutBillingSignatureInput,
): string {
  return [
    input.tier,
    input.status ?? '',
    input.periodEnd ?? '',
    input.cancelAtPeriodEnd ? '1' : '0',
  ].join('|');
}

export function hasCheckoutBillingCaughtUp(input: {
  baselineSignature: string;
  currentSignature: string;
}): boolean {
  return input.currentSignature !== input.baselineSignature;
}

export function shouldContinueCheckoutSync(input: {
  elapsedMs: number;
  timeoutMs?: number;
  caughtUp: boolean;
}): boolean {
  if (input.caughtUp) {
    return false;
  }

  return input.elapsedMs < (input.timeoutMs ?? CHECKOUT_SYNC_TIMEOUT_MS);
}
