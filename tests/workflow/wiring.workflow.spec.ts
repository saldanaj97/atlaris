import { workflowWiringPingWorkflow } from '@tests/helpers/workflow/wiring-workflow';
import { describe, expect, it } from 'vitest';
import { start } from 'workflow/api';

describe('workflow SDK wiring', () => {
  it('starts a workflow in-process and returns the step result', async () => {
    const run = await start(workflowWiringPingWorkflow, ['ping']);

    expect(run.runId).toMatch(/^wrun_/);

    const result = await run.returnValue;
    expect(result).toEqual({ echo: 'ping' });
    expect(await run.status).toBe('completed');
  });
});
