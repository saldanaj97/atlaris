/**
 * Convert OpenRouter-reported USD cost to integer micro-USD for DB storage.
 * 1 micro-USD = 1e-6 USD.
 */
export function usdCostToMicrousdInteger(usd: number): number {
	if (!Number.isFinite(usd) || usd < 0) {
		throw new Error(`Invalid OpenRouter USD cost: ${String(usd)}`);
	}
	return Math.round(usd * 1_000_000);
}

/**
 * Convert a signed integer micro-USD value into a bigint for persistence/math.
 * Callers own domain-level sign validation; this helper only enforces integer safety.
 */
export function microusdIntegerToBigint(microusd: number): bigint {
	if (
		!Number.isFinite(microusd) ||
		!Number.isInteger(microusd) ||
		!Number.isSafeInteger(microusd)
	) {
		throw new TypeError(`Invalid micro-USD integer: ${String(microusd)}`);
	}
	return BigInt(microusd);
}
