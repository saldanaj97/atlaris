export type ParsedCaptureBaselineArgs = {
  outDir: string;
  anonBase: string | null;
  authBase: string | null;
  help: boolean;
};

export function stripLeadingDoubleDash(argv: string[]): string[] {
  return argv[0] === '--' ? argv.slice(1) : argv;
}

export function parseCaptureBaselineArgs(
  argv: string[],
): ParsedCaptureBaselineArgs {
  const args = stripLeadingDoubleDash(argv);
  let outDir = `screenshots/frontend-baseline-${new Date().toISOString().slice(0, 10)}`;
  let anonBase: string | null = null;
  let authBase: string | null = null;
  let help = false;

  for (const raw of args) {
    if (raw === '--help' || raw === '-h') {
      help = true;
      continue;
    }
    if (raw.startsWith('--out=')) {
      outDir = raw.slice('--out='.length);
      continue;
    }
    if (raw.startsWith('--anon-base=')) {
      anonBase = raw.slice('--anon-base='.length).replace(/\/$/, '');
      continue;
    }
    if (raw.startsWith('--auth-base=')) {
      authBase = raw.slice('--auth-base='.length).replace(/\/$/, '');
      continue;
    }
  }

  return { outDir, anonBase, authBase, help };
}
