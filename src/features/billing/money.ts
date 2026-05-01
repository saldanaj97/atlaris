/** Shared `formatAmount` for billing + pricing UI (`DEFAULT_LOCALE` when no `navigator`). */
const DEFAULT_LOCALE = 'en-US';
const CURRENCY_CODE_PATTERN = /^[A-Z]{3}$/i;

function resolveLocale(locale?: string): string {
  if (typeof locale === 'string' && locale.trim().length > 0) {
    return locale;
  }

  if (
    typeof navigator !== 'undefined' &&
    typeof navigator.language === 'string' &&
    navigator.language.trim().length > 0
  ) {
    return navigator.language;
  }

  return DEFAULT_LOCALE;
}

function normalizeCurrency(currency: string): string | null {
  const normalizedCurrency = currency.trim().toUpperCase();
  return CURRENCY_CODE_PATTERN.test(normalizedCurrency)
    ? normalizedCurrency
    : null;
}

function normalizeFractionDigits(fractionDigits: number): number {
  if (!Number.isFinite(fractionDigits)) {
    return 2;
  }

  return Math.min(20, Math.max(0, Math.floor(fractionDigits)));
}

export function formatAmount(
  cents?: number | null,
  currency: string = 'USD',
  fractionDigits: number = 2,
  locale?: string,
): string {
  if (cents == null || !Number.isFinite(cents)) return '—';

  const amount = cents / 100;
  const normalizedCurrency = normalizeCurrency(currency);
  const normalizedFractionDigits = normalizeFractionDigits(fractionDigits);

  if (normalizedCurrency == null) {
    return amount.toFixed(normalizedFractionDigits);
  }

  const formatOptions: Intl.NumberFormatOptions = {
    style: 'currency',
    currency: normalizedCurrency,
    minimumFractionDigits: normalizedFractionDigits,
    maximumFractionDigits: normalizedFractionDigits,
  };

  try {
    return new Intl.NumberFormat(resolveLocale(locale), formatOptions).format(
      amount,
    );
  } catch {
    try {
      return new Intl.NumberFormat(DEFAULT_LOCALE, formatOptions).format(
        amount,
      );
    } catch {
      return amount.toFixed(normalizedFractionDigits);
    }
  }
}
