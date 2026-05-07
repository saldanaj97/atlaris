import { describe, expect, it } from 'vitest';

import { serializeErrorForLog } from '@/lib/errors';

describe('serializeErrorForLog', () => {
  it('serializes Error with cause chain and clips long message', () => {
    const root = new Error('root');
    const err = new Error('x'.repeat(3000));
    err.cause = root;
    const out = serializeErrorForLog(err);
    expect(out.name).toBe('Error');
    expect(String(out.message).length).toBeLessThan(3000);
    expect(out.cause).toEqual(
      expect.objectContaining({ name: 'Error', message: 'root' }),
    );
  });

  it('non-Error object uses loggable details plus bounded preview', () => {
    const out = serializeErrorForLog({ foo: 'bar', nested: { x: 1 } });
    expect(out.kind).toBe('object');
    expect(out).toHaveProperty('preview');
    expect(String(out.preview).length).toBeLessThanOrEqual(2001);
  });

  it('records extra enumerable keys on errors up to cap', () => {
    const err = new Error('e');
    Object.assign(err, {
      a: 1,
      b: 2,
      c: 3,
      d: 4,
      e: 5,
      f: 6,
      g: 7,
      h: 8,
      i: 9,
      j: 10,
      k: 11,
      l: 12,
      m: 13,
      n: 14,
      o: 15,
      p: 16,
      q: 17,
      r: 18,
      s: 19,
      t: 20,
      u: 21,
      v: 22,
      w: 23,
      x: 24,
      y: 25,
      z: 26,
      aa: 27,
    });
    const out = serializeErrorForLog(err);
    expect(out.extraTruncated).toBe(true);
  });
});
