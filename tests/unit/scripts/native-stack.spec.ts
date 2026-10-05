import { writeStackEnvLocal } from '../../../scripts/db/native-stack';
import {
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const URL_A = 'postgresql://postgres:postgres@127.0.0.1:23456/postgres';
const dirs: string[] = [];

function tempEnvFile(content?: string): { dir: string; file: string } {
  const dir = mkdtempSync(join(tmpdir(), 'atlaris-env-writer-'));
  dirs.push(dir);
  const file = join(dir, '.env.local');
  if (content !== undefined) writeFileSync(file, content);
  return { dir, file };
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

describe('writeStackEnvLocal', () => {
  it('sets both URLs and preserves every other line', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const { file } = tempEnvFile(
      `FOO=bar\nPOSTGRES_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres\n# note\n`,
    );

    writeStackEnvLocal(URL_A, file);

    expect(readFileSync(file, 'utf8')).toBe(
      `FOO=bar\nPOSTGRES_URL=${URL_A}\n# note\nPOSTGRES_URL_NON_POOLING=${URL_A}\n`,
    );
  });

  it('creates the file when missing', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const { file } = tempEnvFile();

    writeStackEnvLocal(URL_A, file);

    expect(readFileSync(file, 'utf8')).toBe(
      `POSTGRES_URL=${URL_A}\nPOSTGRES_URL_NON_POOLING=${URL_A}\n`,
    );
  });

  it('refuses a non-local stack URL', () => {
    const { file } = tempEnvFile();

    expect(() =>
      writeStackEnvLocal('postgresql://u:p@db.example.com:5432/postgres', file),
    ).toThrow(/non-local/);
    expect(existsSync(file)).toBe(false);
  });

  it('refuses a file holding a hosted value for either key', () => {
    const hosted = 'postgresql://u:p@db.example.com:5432/postgres';
    const { file } = tempEnvFile(`POSTGRES_URL_NON_POOLING=${hosted}\n`);

    expect(() => writeStackEnvLocal(URL_A, file)).toThrow(/non-local/);
    expect(readFileSync(file, 'utf8')).toBe(
      `POSTGRES_URL_NON_POOLING=${hosted}\n`,
    );
  });

  it('replaces a symlink with a real copy and leaves the target untouched', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const { dir, file } = tempEnvFile();
    const target = join(dir, 'main.env');
    writeFileSync(target, 'FOO=bar\n');
    symlinkSync(target, file);

    writeStackEnvLocal(URL_A, file);

    expect(lstatSync(file).isSymbolicLink()).toBe(false);
    expect(readFileSync(file, 'utf8')).toContain('FOO=bar');
    expect(readFileSync(target, 'utf8')).toBe('FOO=bar\n');
  });
});
