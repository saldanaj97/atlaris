import { describe, expect, it } from 'vitest';

import { buildResourcesByTask } from '@/lib/db/queries/helpers/modules-helpers';
import type { ModuleResourceRow } from '@/lib/db/queries/types/modules.types';

const BASE_DATE = new Date('2026-01-01T00:00:00.000Z');

function buildResourceRow(
	overrides: Partial<ModuleResourceRow>,
): ModuleResourceRow {
	return {
		id: overrides.id ?? 'task-resource-1',
		taskId: overrides.taskId ?? 'task-1',
		resourceId: overrides.resourceId ?? 'resource-1',
		order: overrides.order ?? 1,
		notes: overrides.notes ?? null,
		createdAt: overrides.createdAt ?? BASE_DATE,
		resource: {
			id: overrides.resource?.id ?? 'resource-1',
			type: overrides.resource?.type ?? 'article',
			title: overrides.resource?.title ?? 'Article',
			url: overrides.resource?.url ?? 'https://example.com/article',
			domain: overrides.resource?.domain ?? 'example.com',
			author: overrides.resource?.author ?? 'Author',
			durationMinutes: overrides.resource?.durationMinutes ?? 30,
			costCents: overrides.resource?.costCents ?? null,
			currency: overrides.resource?.currency ?? null,
			tags: overrides.resource?.tags ?? [],
			createdAt: overrides.resource?.createdAt ?? BASE_DATE,
		},
	};
}

describe('modules helpers', () => {
	describe('buildResourcesByTask', () => {
		it('groups task resources by task id while preserving row order per task', () => {
			const rows: ModuleResourceRow[] = [
				buildResourceRow({ id: 'tr-1', taskId: 't1', order: 1 }),
				buildResourceRow({ id: 'tr-2', taskId: 't1', order: 2 }),
				buildResourceRow({ id: 'tr-3', taskId: 't2', order: 1 }),
			];

			const result = buildResourcesByTask(rows);

			expect(result.get('t1')).toHaveLength(2);
			expect(result.get('t1')?.map((row) => row.id)).toEqual(['tr-1', 'tr-2']);
			expect(result.get('t2')).toHaveLength(1);
			expect(result.get('t2')?.[0].id).toBe('tr-3');
		});
	});
});
