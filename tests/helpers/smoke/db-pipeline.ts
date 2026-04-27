/**
 * Bootstrap, migrate, grant, and seed the disposable smoke database.
 * Uses `NODE_ENV=test` only inside the migration subprocess (matches Vitest Testcontainers).
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import {
	bootstrapDatabase,
	grantRlsPermissions,
} from '@tests/helpers/db/bootstrap';
import { seedLocalProductTestingUser } from '@tests/helpers/db/seed-local-product-testing';

function resolveDrizzleKitCli(): string {
	const binCjs = join(process.cwd(), 'node_modules/drizzle-kit/bin.cjs');
	if (existsSync(binCjs)) {
		return binCjs;
	}
	const binJs = join(process.cwd(), 'node_modules/drizzle-kit/bin.js');
	if (existsSync(binJs)) {
		return binJs;
	}
	throw new Error(
		'drizzle-kit CLI missing under node_modules; run pnpm install from repo root',
	);
}

/** Prefer Node-invoked drizzle-kit so PATH does not need `pnpm` (GUI / minimal shells). */
function applySmokeMigrations(connectionUrl: string): void {
	const drizzleKit = resolveDrizzleKitCli();
	const env: NodeJS.ProcessEnv = {
		...process.env,
		DATABASE_URL: connectionUrl,
		DATABASE_URL_NON_POOLING: connectionUrl,
		DATABASE_URL_UNPOOLED: connectionUrl,
		NODE_ENV: 'test',
	};
	execFileSync(process.execPath, [drizzleKit, 'migrate'], {
		stdio: 'inherit',
		cwd: process.cwd(),
		env,
	});
}

export async function prepareSmokeDatabase(
	connectionUrl: string,
): Promise<void> {
	console.log('[smoke] Bootstrapping database roles and extensions…');
	await bootstrapDatabase(connectionUrl);

	console.log('[smoke] Applying migrations (drizzle-kit migrate)…');
	applySmokeMigrations(connectionUrl);

	console.log('[smoke] Granting RLS permissions…');
	await grantRlsPermissions(connectionUrl);

	console.log('[smoke] Seeding local product-testing user…');
	await seedLocalProductTestingUser(connectionUrl);
}
