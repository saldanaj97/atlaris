import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildIncompleteSmokeState } from '@tests/fixtures/smoke-state';
import { afterEach, describe, expect, it } from 'vitest';

import {
  buildSmokeStatePayload,
  cleanupSmokeStateFile,
  createSmokeStateTempDir,
  readSmokeStateFromPath,
  type SmokeStateFileDeps,
  writeSmokeStateFile,
} from '../../../helpers/smoke/state-file';

class InMemorySmokeFs {
  private fileContents = new Map<string, string>();
  private directories = new Set<string>();
  private tempDirCounter = 0;

  mkdtempSync(prefix: string): string {
    this.tempDirCounter += 1;
    const dirPath = `${prefix}${this.tempDirCounter}`;
    this.directories.add(dirPath);
    return dirPath;
  }

  readFileSync(path: string, _encoding: BufferEncoding): string {
    const contents = this.fileContents.get(path);
    if (contents === undefined) {
      throw new Error('ENOENT: no such file or directory');
    }

    return contents;
  }

  unlinkSync(path: string): void {
    if (!this.fileContents.delete(path)) {
      throw new Error('ENOENT: no such file or directory');
    }
  }

  writeFileSync(path: string, data: string, _encoding: BufferEncoding): void {
    this.fileContents.set(path, data);
  }

  removeDir(path: string): void {
    this.directories.delete(path);
    for (const filePath of [...this.fileContents.keys()]) {
      if (filePath.startsWith(`${path}/`)) {
        this.fileContents.delete(filePath);
      }
    }
  }
}

describe('smoke state-file', () => {
  const fakeFs = new InMemorySmokeFs();
  const createdPaths: string[] = [];
  const createdDirs: string[] = [];
  const deps: Partial<SmokeStateFileDeps> = {
    createId: () => 'fixed-id',
    fs: {
      mkdtempSync: fakeFs.mkdtempSync.bind(fakeFs),
      readFileSync: fakeFs.readFileSync.bind(fakeFs),
      unlinkSync: fakeFs.unlinkSync.bind(fakeFs),
      writeFileSync: fakeFs.writeFileSync.bind(fakeFs),
    },
    tempDirParent: tmpdir(),
  };

  afterEach(() => {
    for (const p of createdPaths.splice(0)) {
      cleanupSmokeStateFile(p, deps);
    }
    for (const dir of createdDirs.splice(0)) {
      fakeFs.removeDir(dir);
    }
  });

  it('writes and reads round-trip URL fields', () => {
    const dir = createSmokeStateTempDir(deps);
    createdDirs.push(dir);
    const payload = buildSmokeStatePayload(
      'postgresql://u:p@127.0.0.1:5432/atlaris_test'
    );
    const path = writeSmokeStateFile(dir, payload, deps);
    createdPaths.push(path);
    expect(readSmokeStateFromPath(path, deps)).toEqual(payload);
  });

  it('fails fast when file is missing', () => {
    expect(() =>
      readSmokeStateFromPath(join(tmpdir(), 'missing-smoke-state.json'), deps)
    ).toThrow(/cannot read/);
  });

  it('fails fast on malformed JSON', () => {
    const dir = createSmokeStateTempDir(deps);
    createdDirs.push(dir);
    const path = join(dir, 'bad.json');
    fakeFs.writeFileSync(path, '{ not json', 'utf8');
    createdPaths.push(path);
    expect(() => readSmokeStateFromPath(path, deps)).toThrow(/invalid JSON/);
  });

  it('fails fast when a required key is missing', () => {
    const dir = createSmokeStateTempDir(deps);
    createdDirs.push(dir);
    const path = join(dir, 'incomplete.json');
    fakeFs.writeFileSync(
      path,
      JSON.stringify(buildIncompleteSmokeState()),
      'utf8'
    );
    createdPaths.push(path);
    expect(() => readSmokeStateFromPath(path, deps)).toThrow(
      /DATABASE_URL_UNPOOLED/
    );
  });

  it('cleanup removes the state file', () => {
    const dir = createSmokeStateTempDir(deps);
    createdDirs.push(dir);
    const path = writeSmokeStateFile(
      dir,
      buildSmokeStatePayload('postgresql://localhost/db'),
      deps
    );
    expect(() => readSmokeStateFromPath(path, deps)).not.toThrow();
    cleanupSmokeStateFile(path, deps);
    expect(() => readSmokeStateFromPath(path, deps)).toThrow(/cannot read/);
  });

  it('createSmokeStateTempDir creates a unique directory under tmpdir', () => {
    const a = createSmokeStateTempDir(deps);
    const b = createSmokeStateTempDir(deps);
    createdDirs.push(a, b);
    expect(a).not.toBe(b);
    expect(a.startsWith(join(tmpdir(), 'atlaris-smoke-'))).toBe(true);
  });
});
