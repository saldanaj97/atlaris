/**
 * Validates that the title-length CHECK constraints in the migration match
 * the canonical constants, so DB and application limits stay in sync.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

import {
	MAX_MODULE_TITLE_LENGTH,
	MAX_RESOURCE_TITLE_LENGTH,
	MAX_TASK_TITLE_LENGTH,
} from '@/lib/db/schema/constants';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));

function findMigrationSqlForTitleConstraints(): string {
	const migrationsDir = join(TEST_DIR, '../../../src/lib/db/migrations');
	let files: string[];
	try {
		files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'));
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(
			`Could not read migrations directory: ${migrationsDir}. ${message}`,
		);
	}

	const matches: string[] = [];
	const matchedFiles: string[] = [];
	for (const file of files) {
		const fullPath = join(migrationsDir, file);
		const content = readFileSync(fullPath, 'utf8');
		if (
			content.includes('module_title_length') &&
			content.includes('task_title_length') &&
			content.includes('resource_title_length')
		) {
			matches.push(content);
			matchedFiles.push(file);
		}
	}

	if (matches.length === 0) {
		throw new Error(
			`No migration in ${migrationsDir} contains module_title_length, task_title_length, and resource_title_length CHECK definitions. Scanned ${String(files.length)} files.`,
		);
	}

	if (matches.length > 1) {
		throw new Error(
			`Multiple migrations contain the three title-length constraints: ${matchedFiles.join(', ')} (found ${String(matches.length)} files).`,
		);
	}

	return matches[0];
}

/**
 * Extracts the numeric `<= N` limit from a CHECK involving char_length/length(title).
 * Throws with constraint name and a SQL sample if no match.
 */
function extractCheckLimit(constraintName: string, sqlText: string): number {
	const escaped = constraintName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const re = new RegExp(
		`(?:CONSTRAINT\\s+)?(?:"${escaped}"|${escaped})\\s+CHECK\\s*\\(\\s*(?:char_length|length)\\s*\\([^)]+\\)\\s*<=\\s*(\\d+)`,
		'is',
	);
	const match = sqlText.match(re);
	if (!match) {
		const sample = sqlText.slice(0, 600);
		throw new Error(
			`Could not parse CHECK limit for constraint "${constraintName}". Sample SQL:\n${sample}`,
		);
	}
	return Number(match[1]);
}

describe('title length constraint sync', () => {
	let migrationContents: string;

	beforeAll(() => {
		migrationContents = findMigrationSqlForTitleConstraints();
	});

	it('module_title_length migration matches MAX_MODULE_TITLE_LENGTH', () => {
		const limit = extractCheckLimit('module_title_length', migrationContents);
		expect(limit).toBe(MAX_MODULE_TITLE_LENGTH);
	});

	it('task_title_length migration matches MAX_TASK_TITLE_LENGTH', () => {
		const limit = extractCheckLimit('task_title_length', migrationContents);
		expect(limit).toBe(MAX_TASK_TITLE_LENGTH);
	});

	it('resource_title_length migration matches MAX_RESOURCE_TITLE_LENGTH', () => {
		const limit = extractCheckLimit('resource_title_length', migrationContents);
		expect(limit).toBe(MAX_RESOURCE_TITLE_LENGTH);
	});
});
