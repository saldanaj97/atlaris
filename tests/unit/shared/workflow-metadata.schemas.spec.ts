import { WorkflowSdkMetadataSchema } from '@/shared/schemas/workflow-metadata.schemas';
import { describe, expect, it } from 'vitest';

describe('WorkflowSdkMetadataSchema', () => {
  it('accepts workflow SDK run metadata', () => {
    expect(
      WorkflowSdkMetadataSchema.parse({
        provider: 'workflow-sdk',
        runId: 'wrun_test',
        startedAt: '2026-01-01T00:00:00.000Z',
      }),
    ).toMatchObject({ provider: 'workflow-sdk', runId: 'wrun_test' });
  });

  it('rejects invalid providers and extra fields', () => {
    expect(() =>
      WorkflowSdkMetadataSchema.parse({
        provider: 'other',
        runId: 'wrun_test',
      }),
    ).toThrow();
    expect(() =>
      WorkflowSdkMetadataSchema.parse({
        provider: 'workflow-sdk',
        runId: 'wrun_test',
        extra: true,
      }),
    ).toThrow();
  });
});
