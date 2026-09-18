import {
  parseTestArgs,
  runTestPlan,
  TestCliUsageError,
  type TestCommand,
} from '../../../scripts/tests/cli';
import { describe, expect, it } from 'vitest';

function firstCommand(
  phase: ReturnType<typeof parseTestArgs>[number],
): TestCommand {
  const command = phase.commands[0];
  if (!command) throw new Error(`Expected a command for ${phase.label}`);
  return command;
}

describe('pnpm test dispatcher', () => {
  it('keeps the default as changed unit and integration-class coverage', () => {
    const plan = parseTestArgs([]);

    expect(plan.map((phase) => phase.label)).toEqual([
      'unit --changed',
      'integration --changed',
    ]);
    expect(firstCommand(plan[0]).args).toContain('--changed');
    expect(plan[1].commands).toHaveLength(2);
    expect(plan[1].stopOnFailure).toBe(true);
  });

  it('preserves full and changed unit/integration suite commands', () => {
    const unit = firstCommand(parseTestArgs(['unit'])[0]);
    expect(unit.args).toEqual([
      'vitest',
      'run',
      '--config',
      'vitest.config.ts',
      '--project',
      'unit',
      'tests/unit',
    ]);
    expect(unit.env).toEqual({ SKIP_DB_TEST_SETUP: 'true', NODE_ENV: 'test' });

    const integrationChanged = parseTestArgs(['integration', '--changed'])[0];
    expect(integrationChanged.commands[0]?.args).toContain('--changed');
    expect(integrationChanged.commands[1]?.args).toContain('--changed');
    expect(integrationChanged.commands[1]?.args).toContain('--passWithNoTests');
    expect(integrationChanged.commands[1]?.args.at(-1)).toBe('tests/workflow');
  });

  it('supports the aggregate suite and optional e2e phase', () => {
    expect(parseTestArgs(['all']).map((phase) => phase.label)).toEqual([
      'check',
      'unit',
      'integration',
      'workflow',
      'security',
    ]);
    expect(parseTestArgs(['all', '--e2e']).map((phase) => phase.label)).toEqual(
      ['check', 'unit', 'integration', 'workflow', 'security', 'e2e'],
    );
  });

  it('forwards smoke runner options without changing suite semantics', () => {
    const smoke = firstCommand(
      parseTestArgs(['smoke', '--project', 'smoke-anon'])[0],
    );
    expect(smoke.args).toEqual([
      'exec',
      'tsx',
      'scripts/tests/smoke/run.ts',
      '--project',
      'smoke-anon',
    ]);

    const separatedSmoke = firstCommand(
      parseTestArgs(['smoke', '--', '--project', 'smoke-anon'])[0],
    );
    expect(separatedSmoke.args).toEqual(smoke.args);
  });

  it('rejects unsupported suite options', () => {
    expect(() => parseTestArgs(['workflow', '--changed'])).toThrow(
      TestCliUsageError,
    );
    expect(() => parseTestArgs(['all', '--changed'])).toThrow(
      TestCliUsageError,
    );
    expect(() => parseTestArgs(['unknown'])).toThrow(TestCliUsageError);
  });

  it('short-circuits the changed integration workflow phase', async () => {
    const seen: string[] = [];
    const exitCode = await runTestPlan(
      parseTestArgs(['integration', '--changed']),
      async (command) => {
        seen.push(command.args.join(' '));
        return 7;
      },
    );

    expect(exitCode).toBe(7);
    expect(seen).toHaveLength(1);
  });

  it('preserves a direct suite exit code instead of normalizing it', async () => {
    const exitCode = await runTestPlan(parseTestArgs(['unit']), async () => 2);

    expect(exitCode).toBe(2);
  });

  it('runs later aggregate phases after an earlier phase fails', async () => {
    const seen: string[] = [];
    const exitCode = await runTestPlan(parseTestArgs([]), async (command) => {
      seen.push(command.args.join(' '));
      return seen.length === 1 ? 7 : 0;
    });

    expect(exitCode).toBe(1);
    expect(seen).toHaveLength(3);
  });
});
