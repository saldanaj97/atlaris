import {
  checkResearchOutput,
  RESEARCH_BRIEF_MAX_CHARS,
  ResearchOutputError,
} from '@/features/plans/research/contract';
import { describe, expect, it } from 'vitest';

const CITATIONS = [
  {
    url: 'https://doc.rust-lang.org/book/ch04-00-understanding-ownership.html',
  },
  { url: 'https://www.rust-lang.org/learn/', title: 'Learn Rust' },
];

function output(brief: string, sources: unknown[]): string {
  return JSON.stringify({ brief, sources });
}

describe('checkResearchOutput', () => {
  it('drops uncited URLs, renumbers keys and rewrites brief markers', () => {
    const text = output('Ownership [S1]. Hype [S2]. Learn [S3].', [
      {
        key: 'S1',
        title: 'Understanding Ownership',
        url: 'https://doc.rust-lang.org/book/ch04-00-understanding-ownership.html',
        publisher: 'The Rust Project',
      },
      {
        key: 'S2',
        title: 'Uncited blog',
        url: 'https://blog.example.com/rust',
        publisher: 'Example',
      },
      // Cited, with a trailing-slash and host-case difference.
      { key: 'S3', title: '', url: 'https://WWW.rust-lang.org/learn' },
    ]);

    expect(checkResearchOutput(text, CITATIONS)).toEqual({
      research: {
        brief: 'Ownership [S1]. Hype. Learn [S2].',
        sources: [
          {
            key: 'S1',
            title: 'Understanding Ownership',
            url: 'https://doc.rust-lang.org/book/ch04-00-understanding-ownership.html',
            publisher: 'The Rust Project',
          },
          {
            key: 'S2',
            title: 'Learn Rust',
            url: 'https://WWW.rust-lang.org/learn',
            publisher: 'rust-lang.org',
          },
        ],
      },
      droppedSourceCount: 1,
    });
  });

  it('keeps one source per URL and points duplicate keys at it', () => {
    const url = CITATIONS[0]!.url;
    const text = output('A [S1] and B [S2].', [
      { key: 'S1', title: 'One', url },
      { key: 'S2', title: 'Same', url: `${url}#section` },
    ]);

    const { research } = checkResearchOutput(text, CITATIONS);

    expect(research.sources.map((source) => source.key)).toEqual(['S1']);
    expect(research.brief).toBe('A [S1] and B [S1].');
  });

  it('reads fenced JSON wrapped in prose', () => {
    const text = `Here it is:\n\`\`\`json\n${output('Brief [S1].', [
      { key: 'S1', title: 'Learn', url: CITATIONS[1]!.url },
    ])}\n\`\`\``;

    expect(checkResearchOutput(text, CITATIONS).research.sources).toHaveLength(
      1,
    );
  });

  it('caps the brief on a word boundary', () => {
    const brief = `${'word '.repeat(RESEARCH_BRIEF_MAX_CHARS / 4)}[S1]`;
    const text = output(brief, [
      { key: 'S1', title: 'Learn', url: CITATIONS[1]!.url },
    ]);

    const { research } = checkResearchOutput(text, CITATIONS);

    expect(research.brief.length).toBeLessThanOrEqual(RESEARCH_BRIEF_MAX_CHARS);
    expect(research.brief.endsWith('word')).toBe(true);
  });

  it('rejects output with no cited source', () => {
    const text = output('Brief [S1].', [
      { key: 'S1', title: 'Blog', url: 'https://blog.example.com/rust' },
    ]);

    expect(() => checkResearchOutput(text, CITATIONS)).toThrow(
      ResearchOutputError,
    );
  });

  it('rejects text that is not the contract JSON', () => {
    expect(() => checkResearchOutput('no json here', CITATIONS)).toThrow(
      ResearchOutputError,
    );
    expect(() =>
      checkResearchOutput(JSON.stringify({ brief: 'x' }), CITATIONS),
    ).toThrow(ResearchOutputError);
  });
});
