import { z } from 'zod';

/**
 * Custom error type for environment variable validation failures.
 * Allows callers to identify and handle configuration errors consistently,
 * including redaction of sensitive information in logs.
 */
export class EnvValidationError extends Error {
	constructor(
		message: string,
		public readonly envKey?: string,
		options?: ErrorOptions,
	) {
		super(message, options);
		this.name = 'EnvValidationError';
	}
}

const normalize = (value: string | undefined | null): string | undefined => {
	if (value === undefined || value === null) return undefined;
	const trimmed = value.trim();
	return trimmed === '' ? undefined : trimmed;
};

/**
 * Read-only view of environment variables (e.g. `process.env` or a test fixture).
 */
export type EnvSource = Readonly<Record<string, string | undefined>>;

/**
 * Live Node `process.env` as {@link EnvSource}. Use only at process-bound edges
 * (default singletons). Prefer an explicit object in factories and tests, and pass it to
 * {@link isProdRuntimeEnv} / {@link isNonProductionRuntimeEnv} / parsers.
 */
export function getProcessEnvSource(): EnvSource {
	return process.env as EnvSource;
}

type NodeEnv = 'development' | 'production' | 'test';

const NodeEnvSchema = z.enum(['development', 'production', 'test']);

export function optionalEnvFrom(
	env: EnvSource,
	key: string,
): string | undefined {
	return normalize(env[key]);
}

export function requireEnvFrom(env: EnvSource, key: string): string {
	const value = optionalEnvFrom(env, key);
	if (!value) {
		throw new EnvValidationError(
			`Missing required environment variable: ${key}`,
			key,
		);
	}
	return value;
}

/**
 * Parses `NODE_ENV` strictly. Missing or empty treats as `development`.
 * Invalid values throw {@link EnvValidationError}.
 */
export function parseNodeEnv(env: EnvSource): NodeEnv {
	const raw = optionalEnvFrom(env, 'NODE_ENV');
	if (raw === undefined) {
		return 'development';
	}
	const parsed = NodeEnvSchema.safeParse(raw);
	if (!parsed.success) {
		throw new EnvValidationError(
			`NODE_ENV must be one of: development, production, test. Received: ${raw}`,
			'NODE_ENV',
		);
	}
	return parsed.data;
}

export function isProdRuntimeEnv(env: EnvSource): boolean {
	return parseNodeEnv(env) === 'production';
}

/** True for development and test runtimes (not production). */
function isNonProductionRuntimeEnv(env: EnvSource): boolean {
	return !isProdRuntimeEnv(env);
}

/**
 * Zod schema: string that parses to a finite number via `Number()`; `NaN` and
 * infinities fail parse
 * (callers fall back to optional defaults).
 */
const parseableNumericEnvString = z.string().transform((s, ctx) => {
	const n = Number(s);
	if (!Number.isFinite(n)) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			message: 'Not a valid finite number',
		});
		return z.NEVER;
	}
	return n;
});

/**
 * Parses optional env string into a finite number. Invalid values map to the
 * fallback or `undefined`.
 */
export function parseEnvNumber(value: string | undefined): number | undefined;
export function parseEnvNumber(
	value: string | undefined,
	fallback: number,
): number;
export function parseEnvNumber(
	value: string | undefined,
	fallback?: number,
): number | undefined {
	if (value === undefined) {
		return fallback;
	}
	const parsed = parseableNumericEnvString.safeParse(value);
	if (!parsed.success) {
		return fallback;
	}
	return parsed.data;
}

/**
 * Parses a string to a boolean. Use for consistent env boolean parsing.
 * Truthy (case-insensitive, trimmed): 'true' | '1'. All other non-empty values are false.
 */
export function toBoolean(
	value: string | undefined,
	fallback: boolean,
): boolean {
	if (value === undefined) {
		return fallback;
	}

	const normalized = value.trim().toLowerCase();
	if (normalized === '') {
		return fallback;
	}
	return normalized === 'true' || normalized === '1';
}

export function optionalEnv(key: string): string | undefined {
	return optionalEnvFrom(getProcessEnvSource(), key);
}

export function requireEnv(key: string): string {
	return requireEnvFrom(getProcessEnvSource(), key);
}

function ensureServerRuntime(isNonProduction: boolean): void {
	if (isNonProduction) {
		return;
	}
	if (typeof window !== 'undefined') {
		throw new EnvValidationError(
			'Attempted to access a server-only environment variable in the browser bundle.',
		);
	}
}

function getCachedServerRequired(
	cache: Map<string, string>,
	key: string,
	loader: () => string,
): string {
	if (!cache.has(key)) {
		cache.set(key, loader());
	}
	const cached = cache.get(key);
	if (cached === undefined) {
		throw new Error(`Invariant: env cache missing key "${key}"`);
	}
	return cached;
}

export interface ServerEnvAccess {
	getServerRequired(key: string): string;
	getServerOptional(key: string): string | undefined;
	getServerRequiredProdOnly(key: string): string | undefined;
	getProductionCached<T>(key: string, loader: () => T): T;
}

/**
 * Server env reads bound to a live env source (typically {@link getProcessEnvSource}).
 * Caches required/optional reads in production only; non-production re-reads each time.
 */
export function createServerEnvAccess(
	getEnv: () => EnvSource,
): ServerEnvAccess {
	const requiredCache = new Map<string, string>();
	const optionalCache = new Map<string, string | undefined>();
	const productionCache = new Map<string, unknown>();

	const getServerState = (): {
		env: EnvSource;
		isNonProduction: boolean;
	} => {
		const env = getEnv();
		const isNonProduction = isNonProductionRuntimeEnv(env);
		ensureServerRuntime(isNonProduction);
		return { env, isNonProduction };
	};

	return {
		getServerRequired(key: string): string {
			const { env, isNonProduction } = getServerState();
			if (isNonProduction) {
				return requireEnvFrom(env, key);
			}
			return getCachedServerRequired(requiredCache, key, () =>
				requireEnvFrom(env, key),
			);
		},
		getServerOptional(key: string): string | undefined {
			const { env, isNonProduction } = getServerState();
			if (isNonProduction) {
				return optionalEnvFrom(env, key);
			}
			if (!optionalCache.has(key)) {
				optionalCache.set(key, optionalEnvFrom(env, key));
			}
			return optionalCache.get(key);
		},
		getServerRequiredProdOnly(key: string): string | undefined {
			const { env, isNonProduction } = getServerState();
			if (isNonProduction) {
				return optionalEnvFrom(env, key);
			}
			return getCachedServerRequired(requiredCache, key, () =>
				requireEnvFrom(env, key),
			);
		},
		getProductionCached<T>(key: string, loader: () => T): T {
			const { isNonProduction } = getServerState();
			if (isNonProduction) {
				return loader();
			}
			if (!productionCache.has(key)) {
				productionCache.set(key, loader());
			}
			return productionCache.get(key) as T;
		},
	};
}

const defaultServerEnvAccess = createServerEnvAccess(getProcessEnvSource);

export function getServerRequired(key: string): string {
	return defaultServerEnvAccess.getServerRequired(key);
}

export function getServerOptional(key: string): string | undefined {
	return defaultServerEnvAccess.getServerOptional(key);
}

function assertProdForbiddenFlags(): void {
	const env = getProcessEnvSource();
	if (!isProdRuntimeEnv(env)) {
		return;
	}
	const localProductTestingEnvEnabled = toBoolean(
		optionalEnvFrom(env, 'LOCAL_PRODUCT_TESTING'),
		false,
	);
	if (localProductTestingEnvEnabled) {
		throw new EnvValidationError(
			'LOCAL_PRODUCT_TESTING cannot be enabled in production',
			'LOCAL_PRODUCT_TESTING',
		);
	}
	const stripeLocalModeEnabled = toBoolean(
		optionalEnvFrom(env, 'STRIPE_LOCAL_MODE'),
		false,
	);
	if (stripeLocalModeEnabled) {
		throw new EnvValidationError(
			'STRIPE_LOCAL_MODE cannot be enabled in production',
			'STRIPE_LOCAL_MODE',
		);
	}
}

assertProdForbiddenFlags();

export function getSmokeStateFileEnv(): string | undefined {
	return getServerOptional('SMOKE_STATE_FILE');
}
