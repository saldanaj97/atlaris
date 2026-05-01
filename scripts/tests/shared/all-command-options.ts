export type AllCommandOptions = {
  withE2E: boolean;
  skipLint: boolean;
  skipTypecheck: boolean;
};

export type ParseAllCommandOptionsResult =
  | { kind: 'ok'; options: AllCommandOptions }
  | { kind: 'help' };

const ALL_OPTION_FLAG_HANDLERS: Record<
  string,
  (options: AllCommandOptions) => void
> = {
  '--with-e2e': (o) => {
    o.withE2E = true;
  },
  '--skip-lint': (o) => {
    o.skipLint = true;
  },
  '--skip-typecheck': (o) => {
    o.skipTypecheck = true;
  },
};

/**
 * Parses argv for the `all` test runner command. Mutates no shared state.
 */
export function parseAllCommandOptions(
  args: string[],
): ParseAllCommandOptionsResult {
  const options: AllCommandOptions = {
    withE2E: false,
    skipLint: false,
    skipTypecheck: false,
  };

  for (const arg of args) {
    if (arg === '--help' || arg === '-h') {
      return { kind: 'help' };
    }

    const apply = ALL_OPTION_FLAG_HANDLERS[arg];
    if (apply) {
      apply(options);
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return { kind: 'ok', options };
}
