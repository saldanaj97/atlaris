import { workflowWiringPingWorkflow } from '@tests/helpers/workflow/wiring-workflow';
import { describe, expect, it } from 'vitest';
import { start } from 'workflow/api';

describe('workflow SDK wiring', () => {
  it('starts a workflow in-process', async () => {
    const run = await start(workflowWiringPingWorkflow, ['ping']);

    expect(run.runId).toMatch(/^wrun_/);
  });

  it('returns the step result', async () => {
    const run = await start(workflowWiringPingWorkflow, ['ping']);

    const result = await run.returnValue;
    expect(result).toEqual({ echo: 'ping' });
  });

  it('completes the workflow run', async () => {
    const run = await start(workflowWiringPingWorkflow, ['ping']);

    await run.returnValue;
    expect(await run.status).toBe('completed');
  });
});
