import {
  CHECKOUT_BASELINE_QUERY_PARAM,
  CHECKOUT_RETURN_QUERY_PARAM,
  CHECKOUT_RETURN_QUERY_VALUE,
  isCheckoutReturnQueryValue,
} from '@/features/billing/checkout-return';
import { ROUTES } from '@/features/navigation/routes';
import { redirect } from 'next/navigation';

type SettingsSearchParams = Record<string, string | string[] | undefined>;

function firstSearchParam(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function resolveSettingsEntryRedirect(
  searchParams?: SettingsSearchParams,
): string {
  const checkout = firstSearchParam(
    searchParams?.[CHECKOUT_RETURN_QUERY_PARAM],
  );
  if (!isCheckoutReturnQueryValue(checkout)) {
    return ROUTES.SETTINGS.PROFILE;
  }

  const query = new URLSearchParams({
    [CHECKOUT_RETURN_QUERY_PARAM]: CHECKOUT_RETURN_QUERY_VALUE,
  });
  const baseline = firstSearchParam(
    searchParams?.[CHECKOUT_BASELINE_QUERY_PARAM],
  );
  if (baseline) {
    query.set(CHECKOUT_BASELINE_QUERY_PARAM, baseline);
  }

  return `${ROUTES.SETTINGS.BILLING}?${query.toString()}`;
}

export function runSettingsEntryRedirect(
  searchParams?: SettingsSearchParams,
  redirectFn: typeof redirect = redirect,
): never {
  redirectFn(resolveSettingsEntryRedirect(searchParams));
}
