import { HAIKU_FENCED_TEXT } from './fixtures/openrouter-grounded-streams';
import { ProviderInvalidResponseError } from '@/features/ai/providers/errors';
import { extractFirstJsonObject } from '@/features/ai/providers/openrouter-json';
import { describe, expect, it } from 'vitest';

describe('extractFirstJsonObject', () => {
  it('parses plain JSON output', () => {
    expect(extractFirstJsonObject('{"a":1}')).toEqual({ a: 1 });
  });

  it('takes the fenced object from prose with stray braces', () => {
    expect(extractFirstJsonObject(HAIKU_FENCED_TEXT)).toEqual({
      modules: [{ title: 'Intro', note: 'uses } braces' }],
    });
  });

  it('takes the first balanced object from unfenced prose', () => {
    expect(
      extractFirstJsonObject('Sure! {"a":{"b":"x\\"}"}} and {"c":2}'),
    ).toEqual({ a: { b: 'x"}' } });
  });

  it('skips prose braces that are not JSON', () => {
    expect(extractFirstJsonObject('Use {braces} like {"ok":true}')).toEqual({
      ok: true,
    });
  });

  it('throws an invalid-response error when no object is present', () => {
    expect(() => extractFirstJsonObject('no json here')).toThrow(
      ProviderInvalidResponseError,
    );
    expect(() => extractFirstJsonObject('{"truncated":')).toThrow(
      ProviderInvalidResponseError,
    );
  });
});
