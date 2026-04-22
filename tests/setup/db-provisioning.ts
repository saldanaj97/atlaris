import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import postgres, { type Sql } from 'postgres';

const TEST_DB_PREFIX = 'atlaris_test';
const ADMIN_DB_NAME = 'postgres';
const PROVISIONING_LOCK_KEY_1 = 418_001;
const PROVISIONING_LOCK_KEY_2 = 11;
const DEFAULT_TESTCONTAINERS_ENV_FILE = join(
	__dirname,
	'..',
	'.testcontainers-env.json',
);

type TestDbRuntimeState = {
	ALLOW_DB_TRUNCATE: string;
	TEST_DB_ADMIN_DATABASE: string;
	TEST_DB_BASE_DB_NAME: string;
	TEST_DB_CONTAINER_URL: string;
	TEST_DB_TEMPLATE_DB_NAME: string;
};

type TemplateDatabaseOptions = {
	adminConnectionUrl: string;
	baseDbName: string;
	templateDbName: string;
};

type WorkerDatabaseOptions = {
	adminConnectionUrl: string;
	templateDbName: string;
	workerDbName: string;
};

export function getBaseDbName(): string {
	return `${TEST_DB_PREFIX}_base`;
}

export function getTemplateDbName(): string {
	return `${TEST_DB_PREFIX}_template`;
}

export function normalizeWorkerId(workerId: string | undefined): string {
	const trimmed = workerId?.trim();
	return trimmed && /^\d+$/.test(trimmed) ? trimmed : '1';
}

export function getWorkerDbName(workerId: string | undefined): string {
	return `${TEST_DB_PREFIX}_w${normalizeWorkerId(workerId)}`;
}

export function createDatabaseUrl(
	connectionUrl: string,
	dbName: string,
): string {
	const url = new URL(connectionUrl);
	url.pathname = `/${dbName}`;
	return url.toString();
}

export function createAdminDatabaseUrl(connectionUrl: string): string {
	return createDatabaseUrl(connectionUrl, ADMIN_DB_NAME);
}

export function getTestcontainersEnvFile(): string {
	const configured = process.env.TESTCONTAINERS_ENV_FILE?.trim();
	return configured && configured.length > 0
		? configured
		: DEFAULT_TESTCONTAINERS_ENV_FILE;
}

export function readTestDbRuntimeState(): TestDbRuntimeState | null {
	return readJsonFile<TestDbRuntimeState>(getTestcontainersEnvFile());
}

export function buildTestDbRuntimeState(
	containerUrl: string,
): TestDbRuntimeState {
	return {
		ALLOW_DB_TRUNCATE: 'true',
		TEST_DB_ADMIN_DATABASE: ADMIN_DB_NAME,
		TEST_DB_BASE_DB_NAME: getBaseDbName(),
		TEST_DB_CONTAINER_URL: containerUrl,
		TEST_DB_TEMPLATE_DB_NAME: getTemplateDbName(),
	};
}

export async function ensureDatabaseExists(
	adminConnectionUrl: string,
	dbName: string,
): Promise<void> {
	await withProvisioningLock(adminConnectionUrl, async (sql) => {
		const exists = await databaseExists(sql, dbName);
		if (!exists) {
			await sql.unsafe(`CREATE DATABASE ${quoteIdentifier(dbName)}`);
		}
	});
}

export async function ensureTemplateDatabase({
	adminConnectionUrl,
	baseDbName,
	templateDbName,
}: TemplateDatabaseOptions): Promise<void> {
	await withProvisioningLock(adminConnectionUrl, async (sql) => {
		await dropDatabaseIfExistsWithClient(sql, templateDbName);
		await sql.unsafe(
			`CREATE DATABASE ${quoteIdentifier(templateDbName)} TEMPLATE ${quoteIdentifier(baseDbName)}`,
		);
	});
}

export async function recreateWorkerDatabaseFromTemplate({
	adminConnectionUrl,
	templateDbName,
	workerDbName,
}: WorkerDatabaseOptions): Promise<void> {
	await withProvisioningLock(adminConnectionUrl, async (sql) => {
		await dropDatabaseIfExistsWithClient(sql, workerDbName);
		await sql.unsafe(
			`CREATE DATABASE ${quoteIdentifier(workerDbName)} TEMPLATE ${quoteIdentifier(templateDbName)}`,
		);
	});
}

export async function workerDatabaseExists(
	adminConnectionUrl: string,
	workerDbName: string,
): Promise<boolean> {
	return await withProvisioningLock(adminConnectionUrl, async (sql) => {
		return await databaseExists(sql, workerDbName);
	});
}

export function shouldLogTestDbDebug(): boolean {
	return process.env.TEST_DB_DEBUG === 'true' || process.env.DEBUG === 'true';
}

async function withProvisioningLock<T>(
	adminConnectionUrl: string,
	fn: (sql: Sql) => Promise<T>,
): Promise<T> {
	const sql = postgres(adminConnectionUrl, { max: 1 });

	try {
		await sql`SELECT pg_advisory_lock(${PROVISIONING_LOCK_KEY_1}, ${PROVISIONING_LOCK_KEY_2})`;
		try {
			return await fn(sql);
		} finally {
			await sql`SELECT pg_advisory_unlock(${PROVISIONING_LOCK_KEY_1}, ${PROVISIONING_LOCK_KEY_2})`;
		}
	} finally {
		await sql.end();
	}
}

async function databaseExists(sql: Sql, dbName: string): Promise<boolean> {
	const rows = await sql<{ exists: boolean }[]>`
    SELECT EXISTS(
      SELECT 1
      FROM pg_database
      WHERE datname = ${dbName}
    ) AS exists
  `;

	return rows[0]?.exists ?? false;
}

async function dropDatabaseIfExistsWithClient(
	sql: Sql,
	dbName: string,
): Promise<void> {
	if (!dbName.startsWith(`${TEST_DB_PREFIX}_`)) {
		throw new Error(
			`Refusing to drop database "${dbName}": only ${TEST_DB_PREFIX}_* databases may be dropped here.`,
		);
	}

	const currentDatabaseRows = await sql<{ current_database: string }[]>`
    SELECT current_database()
  `;
	const currentDatabase = currentDatabaseRows[0]?.current_database;

	if (currentDatabase === dbName) {
		throw new Error(
			`Refusing to drop database ${dbName} while connected to it.`,
		);
	}

	const exists = await databaseExists(sql, dbName);
	if (!exists) {
		return;
	}

	await sql`
    SELECT pg_terminate_backend(pid)
    FROM pg_stat_activity
    WHERE datname = ${dbName}
      AND pid <> pg_backend_pid()
  `;
	await sql.unsafe(`DROP DATABASE IF EXISTS ${quoteIdentifier(dbName)}`);
}

function quoteIdentifier(value: string): string {
	return `"${value.replaceAll('"', '""')}"`;
}

function readJsonFile<T>(filePath: string): T | null {
	try {
		if (!existsSync(filePath)) {
			return null;
		}

		return JSON.parse(readFileSync(filePath, 'utf-8')) as T;
	} catch {
		return null;
	}
}
