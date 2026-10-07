import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..');
const INSTALLER = join(REPO_ROOT, 'scripts', 'dev', 'install-local-op.sh');

const homes: string[] = [];

function writeExecutable(path: string, contents: string): void {
  writeFileSync(path, `${contents.trimEnd()}\n`, { mode: 0o755 });
}

function createHome(): {
  home: string;
  bin: string;
  securityLog: string;
  opLog: string;
} {
  const home = mkdtempSync(join(tmpdir(), 'atlaris-local-op-'));
  const bin = join(home, 'bin');
  mkdirSync(bin, { recursive: true });
  homes.push(home);
  return {
    home,
    bin,
    securityLog: join(home, 'security.log'),
    opLog: join(home, 'op.log'),
  };
}

afterEach(() => {
  for (const home of homes.splice(0)) {
    rmSync(home, { recursive: true, force: true });
  }
});

describe('install-local-op', () => {
  it('installs a keychain wrapper and user-level config without writing the token', () => {
    const { home, bin, securityLog } = createHome();
    const realOp = join(bin, 'op');
    const security = join(bin, 'security');
    writeExecutable(realOp, '#!/usr/bin/env bash\nexit 0');
    writeExecutable(
      security,
      [
        '#!/usr/bin/env bash',
        'printf \'mode=%s\\n\' "${1-}" >> "$FAKE_SECURITY_LOG"',
        'exit 0',
      ].join('\n'),
    );

    const wrapperPath = join(home, 'local', 'op-atlaris');
    const configPath = join(home, 'config', 'atlaris', 'dev.sh');
    const result = spawnSync(
      'bash',
      [
        INSTALLER,
        '--environment-id',
        'env-from-install',
        '--op-path',
        realOp,
        '--token-stdin',
        '--force-config',
      ],
      {
        encoding: 'utf8',
        input: 'secret-service-token\n',
        env: {
          ...process.env,
          HOME: home,
          PATH: `${bin}:/usr/bin:/bin`,
          OP_WRAPPER_PATH: wrapperPath,
          ATLARIS_DEV_CONFIG: configPath,
          FAKE_SECURITY_LOG: securityLog,
        },
      },
    );

    const output = `${result.stdout}\n${result.stderr}`;
    expect(result.status).toBe(0);
    expect(output).toContain('Reading service-account token from stdin');
    expect(output).not.toContain('secret-service-token');
    expect(existsSync(wrapperPath)).toBe(true);
    const wrapper = readFileSync(wrapperPath, 'utf8');
    expect(wrapper).toContain(realOp);
    expect(wrapper).not.toContain('secret-service-token');
    expect(wrapper).toContain('atlaris.op-service-account');
    const config = readFileSync(configPath, 'utf8');
    expect(config).toContain(wrapperPath);
    expect(config).toContain('env-from-install');
    expect(config).not.toContain('secret-service-token');
    expect(readFileSync(securityLog, 'utf8')).toContain('add-generic-password');
  });

  it('exports the keychain token to op only and never prints it', () => {
    const { home, bin, opLog } = createHome();
    const realOp = join(bin, 'op');
    const security = join(bin, 'security');
    writeExecutable(
      realOp,
      [
        '#!/usr/bin/env bash',
        'printf \'token=%s\\n\' "${OP_SERVICE_ACCOUNT_TOKEN-}" >> "$FAKE_OP_LOG"',
        'printf \'connect=%s\\n\' "${OP_CONNECT_HOST-}" >> "$FAKE_OP_LOG"',
        'exit 0',
      ].join('\n'),
    );
    writeExecutable(
      security,
      [
        '#!/usr/bin/env bash',
        'if [[ "$1" == find-generic-password ]]; then',
        "  printf 'keychain-token\\n'",
        '  exit 0',
        'fi',
        'exit 1',
      ].join('\n'),
    );

    const wrapperPath = join(home, 'local', 'op-atlaris');
    const install = spawnSync(
      'bash',
      [INSTALLER, '--op-path', realOp, '--force-config'],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          HOME: home,
          PATH: `${bin}:/usr/bin:/bin`,
          OP_WRAPPER_PATH: wrapperPath,
          ATLARIS_DEV_CONFIG: join(home, 'config', 'dev.sh'),
        },
      },
    );
    expect(install.status).toBe(0);

    chmodSync(wrapperPath, 0o700);
    const result = spawnSync('bash', [wrapperPath, 'whoami'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${bin}:/usr/bin:/bin`,
        FAKE_OP_LOG: opLog,
        OP_CONNECT_HOST: 'should-be-cleared',
        OP_SERVICE_ACCOUNT_TOKEN: 'inherited-should-be-replaced',
      },
    });

    const output = `${result.stdout}\n${result.stderr}`;
    expect(result.status).toBe(0);
    expect(readFileSync(opLog, 'utf8')).toContain('token=keychain-token');
    expect(readFileSync(opLog, 'utf8')).toContain('connect=');
    expect(output).not.toContain('keychain-token');
  });

  it('fails closed when the keychain item is missing', () => {
    const { home, bin } = createHome();
    const realOp = join(bin, 'op');
    const security = join(bin, 'security');
    writeExecutable(realOp, '#!/usr/bin/env bash\nexit 0');
    writeExecutable(security, '#!/usr/bin/env bash\nexit 1');

    const wrapperPath = join(home, 'local', 'op-atlaris');
    const install = spawnSync(
      'bash',
      [INSTALLER, '--op-path', realOp, '--force-config'],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          HOME: home,
          PATH: `${bin}:/usr/bin:/bin`,
          OP_WRAPPER_PATH: wrapperPath,
          ATLARIS_DEV_CONFIG: join(home, 'config', 'dev.sh'),
        },
      },
    );
    expect(install.status).toBe(0);

    const result = spawnSync('bash', [wrapperPath, 'whoami'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${bin}:/usr/bin:/bin`,
      },
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('could not read');
  });
});
