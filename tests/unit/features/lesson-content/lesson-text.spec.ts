import {
  parseLessonInline,
  parseLessonText,
} from '@/features/lesson-content/lesson-text';
import { describe, expect, it } from 'vitest';

describe('parseLessonText', () => {
  it('keeps line breaks inside prose and splits on blank lines', () => {
    expect(parseLessonText('One\nTwo\n\nThree')).toEqual([
      { type: 'prose', text: 'One\nTwo' },
      { type: 'prose', text: 'Three' },
    ]);
  });

  it('parses a pipe table and unescapes pipes in cells', () => {
    expect(
      parseLessonText('Result:\n| id | a \\| b |\n|---|:---:|\n| 1 | Ada |'),
    ).toEqual([
      { type: 'prose', text: 'Result:' },
      {
        type: 'table',
        header: ['id', 'a | b'],
        rows: [['1', 'Ada']],
      },
    ]);
  });

  it('keeps fenced code verbatim and drops the fence lines', () => {
    const text = 'Run:\n```sql\nSELECT id,\n    name\n\nFROM t;\n```\nDone';
    expect(parseLessonText(text)).toEqual([
      { type: 'prose', text: 'Run:' },
      { type: 'preformatted', text: 'SELECT id,\n    name\n\nFROM t;' },
      { type: 'prose', text: 'Done' },
    ]);
  });

  it('runs an unclosed fence to the end of the block', () => {
    expect(parseLessonText('```\nSELECT 1;')).toEqual([
      { type: 'preformatted', text: 'SELECT 1;' },
    ]);
  });

  it.each([
    ['an ASCII box table', '+---+---+\n| a | b |\n+---+---+'],
    ['rows with no separator', '| a | b |\n| 1 | 2 |'],
    ['uneven columns', '| a | b |\n|---|---|\n| 1 |'],
    ['a separator with the wrong width', '| a | b |\n|---|\n| 1 | 2 |'],
  ])('keeps %s as a preformatted block', (_name, text) => {
    expect(parseLessonText(text)).toEqual([{ type: 'preformatted', text }]);
  });

  it('leaves a lone pipe line and SQL indentation in prose', () => {
    expect(parseLessonText('a | b\n| c\nSELECT\n    id')).toEqual([
      { type: 'prose', text: 'a | b\n| c\nSELECT\n    id' },
    ]);
  });

  it('returns nothing for blank text', () => {
    expect(parseLessonText(' \n')).toEqual([]);
  });
});

describe('parseLessonInline', () => {
  it('splits inline code and bold from text', () => {
    expect(
      parseLessonInline('`CREATE TABLE` defines **columns** [S1]'),
    ).toEqual([
      { type: 'code', text: 'CREATE TABLE' },
      { type: 'text', text: ' defines ' },
      { type: 'strong', text: 'columns' },
      { type: 'text', text: ' [S1]' },
    ]);
  });

  it('keeps markers inside code literal', () => {
    expect(parseLessonInline('`2 ** 3 ** 4`')).toEqual([
      { type: 'code', text: '2 ** 3 ** 4' },
    ]);
    expect(parseLessonInline('`` a`b ``')).toEqual([
      { type: 'code', text: 'a`b' },
    ]);
  });

  it.each([
    'SELECT COUNT(*) FROM t',
    '2 ** 3 ** 4',
    'an unmatched ` backtick',
    '**unbalanced bold',
  ])('leaves %s as plain text', (text) => {
    expect(parseLessonInline(text)).toEqual([{ type: 'text', text }]);
  });
});
