import { type AgentCommand, type AgentCommands, fail } from './agent-db-common';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const BACKEND_ENV = 'ATLARIS_AGENT_DB';
const AGENT_COMMANDS: readonly AgentCommand[] = [
  'preflight',
  'up',
  'reset',
  'status',
];

export type AgentBackend = 'native' | 'postgres';

/**
 * The native Supabase stack is the default. The legacy PostgreSQL 17 path
 * stays available only through an explicit `ATLARIS_AGENT_DB=postgres`; there
 * is no automatic fallback between them.
 */
export function selectAgentBackend(
  environment: Partial<Record<string, string | undefined>>,
): AgentBackend {
  const value = environment[BACKEND_ENV]?.trim();
  if (!value || value === 'native') return 'native';
  if (value === 'postgres') return 'postgres';
  return fail(`${BACKEND_ENV} must be "native" (default) or "postgres".`);
}

export function assertNoTargetArguments(args: string[]): void {
  if (args.length > 0) {
    fail('Database lifecycle commands do not accept URL or target arguments.');
  }
}

export async function loadAgentCommands(
  backend: AgentBackend,
): Promise<AgentCommands> {
  return backend === 'postgres'
    ? (await import('./legacy-postgres')).COMMANDS
    : (await import('./agent-native-stack')).COMMANDS;
}

async function main(): Promise<void> {
  const command = process.argv[2] as AgentCommand | undefined;
  if (!command || !AGENT_COMMANDS.includes(command)) {
    fail('Usage: cloud-postgres.ts <preflight|up|reset|status>');
  }
  assertNoTargetArguments(process.argv.slice(3));
  const commands = await loadAgentCommands(selectAgentBackend(process.env));
  await commands[command].run();
}

const entrypoint = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : '';
if (import.meta.url === entrypoint) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  });
}
