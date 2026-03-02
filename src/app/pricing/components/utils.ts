/**
 * Formats a monetary amount from cents to a currency string.
 *
 * @param cents - The amount in cents (e.g., 999 for $9.99)
 * @param currency - The currency code (default: 'USD')
 * @param fractionDigits - Number of decimal places to display (default: 2 for cents)
 * @returns Formatted currency string (e.g., "$9.99") or "—" if cents is null/undefined
 *
 * @example
 * formatAmount(999) // "$9.99"
 * formatAmount(1000) // "$10.00"
 * formatAmount(999, 'USD', 0) // "$10"
 * formatAmount(null) // "—"
 */
export function formatAmount(
  cents?: number | null,
  currency: string = 'USD',
  fractionDigits: number = 2
): string {
  if (cents == null) return '—';
  const amount = cents / 100;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(amount);
}
