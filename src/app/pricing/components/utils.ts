/**
 * Formats a monetary amount from cents to a currency string.
 *
 * @param cents - The amount in cents (e.g., 999 for $9.99)
 * @param currency - The currency code (default: 'USD')
 * @param fractionDigits - Number of decimal places to display (default: 2 for cents);
 * values are rounded to the nearest displayed unit when precision is reduced
 * @param locale - Optional BCP 47 locale; defaults to the browser locale when
 * available, otherwise 'en-US'
 * @returns Formatted currency string (e.g., "$9.99") or "—" if cents is null/undefined
 *
 * @example
 * formatAmount(999) // "$9.99"
 * formatAmount(1000) // "$10.00"
 * formatAmount(999, 'USD', 0) // "$10" — rounds 9.99 to 10 when fractionDigits is 0
 * formatAmount(null) // "—"
 */
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

  return Math.max(0, Math.floor(fractionDigits));
}

export function formatAmount(
  cents?: number | null,
  currency: string = 'USD',
  fractionDigits: number = 2,
  locale?: string
): string {
  if (cents == null) return '—';

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
      amount
    );
  } catch {
    try {
      return new Intl.NumberFormat(DEFAULT_LOCALE, formatOptions).format(
        amount
      );
    } catch {
      return amount.toFixed(normalizedFractionDigits);
    }
  }
}
