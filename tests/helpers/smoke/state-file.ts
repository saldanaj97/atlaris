/**
 * Ephemeral smoke DB connection state passed from `scripts/tests/smoke/run.ts`
 * to child processes (launchers, later Playwright). Stored outside the repo
 * under `os.tmpdir()`.
 *
 * We do **not** include `ALLOW_DB_TRUNCATE` here: that flag is for Vitest integration
 * helpers that truncate tables. Browser smoke does not use those helpers.
 */
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { getSmokeStateFileEnv } from '@/lib/config/env';

export const SMOKE_STATE_FILE_ENV = 'SMOKE_STATE_FILE' as const;

export type SmokeStatePayload = {
	DATABASE_URL: string;
	DATABASE_URL_NON_POOLING: string;
	DATABASE_URL_UNPOOLED: string;
};

const SmokeStatePayloadSchema = z.object({
	DATABASE_URL: z.string().min(1),
	DATABASE_URL_NON_POOLING: z.string().min(1),
	DATABASE_URL_UNPOOLED: z.string().min(1),
});

export interface SmokeStateFileDeps {
	fs: {
		mkdtempSync: (prefix: string) => string;
		readFileSync: (filePath: string, encoding: BufferEncoding) => string;
		unlinkSync: (filePath: string) => void;
		writeFileSync: (
			filePath: string,
			data: string,
			encoding: BufferEncoding,
		) => void;
	};
	tempDirParent: string;
	createId: () => string;
}

const DEFAULT_DEPS: SmokeStateFileDeps = {
	fs: {
		mkdtempSync,
		readFileSync,
		unlinkSync,
		writeFileSync,
	},
	tempDirParent: tmpdir(),
	createId: () => randomUUID(),
};

function resolveDeps(
	overrides: Partial<SmokeStateFileDeps> = {},
): SmokeStateFileDeps {
	return {
		...DEFAULT_DEPS,
		...overrides,
		fs: {
			...DEFAULT_DEPS.fs,
			...overrides.fs,
		},
	};
}

function validatePayload(raw: unknown): SmokeStatePayload {
	return SmokeStatePayloadSchema.parse(raw);
}

export function buildSmokeStatePayload(
	connectionUrl: string,
): SmokeStatePayload {
	return {
		DATABASE_URL: connectionUrl,
		DATABASE_URL_NON_POOLING: connectionUrl,
		DATABASE_URL_UNPOOLED: connectionUrl,
	};
}

/**
 * Writes JSON state to `dir` and returns the absolute file path.
 */
export function writeSmokeStateFile(
	dir: string,
	payload: SmokeStatePayload,
	deps?: Partial<SmokeStateFileDeps>,
): string {
	const resolvedDeps = resolveDeps(deps);
	const filePath = join(dir, `smoke-state-${resolvedDeps.createId()}.json`);
	resolvedDeps.fs.writeFileSync(filePath, JSON.stringify(payload), 'utf8');
	return filePath;
}

export function readSmokeStateFromPath(
	filePath: string,
	deps?: Partial<SmokeStateFileDeps>,
): SmokeStatePayload {
	const resolvedDeps = resolveDeps(deps);
	let raw: string;
	try {
		raw = resolvedDeps.fs.readFileSync(filePath, 'utf8');
	} catch (cause) {
		const message = cause instanceof Error ? cause.message : String(cause);
		throw new Error(`Smoke state file: cannot read "${filePath}": ${message}`);
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw) as unknown;
	} catch {
		throw new Error(`Smoke state file: invalid JSON in "${filePath}"`);
	}
	return validatePayload(parsed);
}

export function readSmokeStateFromEnv(): SmokeStatePayload {
	const filePath = getSmokeStateFileEnv();
	if (filePath === undefined || filePath.trim() === '') {
		throw new Error(
			`Smoke state: ${SMOKE_STATE_FILE_ENV} is not set or is empty`,
		);
	}
	return readSmokeStateFromPath(filePath);
}

export function createSmokeStateTempDir(
	deps?: Partial<SmokeStateFileDeps>,
): string {
	const resolvedDeps = resolveDeps(deps);
	return resolvedDeps.fs.mkdtempSync(
		join(resolvedDeps.tempDirParent, 'atlaris-smoke-'),
	);
}

export function cleanupSmokeStateFile(
	filePath: string,
	deps?: Partial<SmokeStateFileDeps>,
): void {
	const resolvedDeps = resolveDeps(deps);
	try {
		resolvedDeps.fs.unlinkSync(filePath);
	} catch (error) {
		console.debug('Smoke state cleanup skipped', { error, filePath });
		// File may already be gone
	}
}
