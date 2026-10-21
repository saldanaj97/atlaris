import type { ResearchBrief } from '@/features/plans/research/contract';
import type {
  LessonContent,
  LessonContentBlock,
} from '@/shared/types/lesson-content.types';

/**
 * One problem found in a lesson. `blockRef` points into the lesson JSON:
 * `blocks[2]`, `blocks[4].items[1]` or `sourceIds`. Same shape as the
 * outline's `OutlineIssue`, so the lesson verifier (JCS-161) can add its own.
 */
export type LessonIssue = {
  readonly code: string;
  readonly blockRef: string;
  readonly message: string;
  readonly source: 'code' | 'verifier';
};

/** `[S1]`, or several keys in one bracket: `[S1, S3]`. */
const CITATION_MARKER_PATTERN = /\[(S\d+(?:\s*[,;]\s*S\d+)*)\]/g;
const RAW_URL_PATTERN = /\bhttps?:\/\/|\bwww\.[a-z0-9-]/i;

type LessonText = { readonly blockRef: string; readonly text: string };

/** Every text field in the lesson body, in reading order. */
function lessonTexts(blocks: readonly LessonContentBlock[]): LessonText[] {
  return blocks.flatMap((block, index): LessonText[] => {
    const ref = `blocks[${index}]`;
    switch (block.type) {
      case 'heading':
      case 'paragraph':
      case 'practice':
        return [{ blockRef: ref, text: block.text }];
      case 'example':
        return [
          { blockRef: ref, text: block.title },
          { blockRef: ref, text: block.text },
        ];
      case 'takeaways':
      case 'completion_criteria':
        return block.items.map((text, item) => ({
          blockRef: `${ref}.items[${item}]`,
          text,
        }));
      default: {
        const _never: never = block;
        throw new Error(`Unhandled lesson block: ${String(_never)}`);
      }
    }
  });
}

function markerKeys(text: string): string[] {
  return [...text.matchAll(CITATION_MARKER_PATTERN)].flatMap((match) =>
    (match[1] ?? '').split(/\s*[,;]\s*/),
  );
}

/** Keys the body cites, unique, in order of first appearance. */
export function citedSourceIds(
  blocks: readonly LessonContentBlock[],
): string[] {
  return [
    ...new Set(lessonTexts(blocks).flatMap(({ text }) => markerKeys(text))),
  ];
}

/**
 * Code checks on a lesson's citations: every cited key (inline or in
 * `sourceIds`) is one of the plan's sources, the body has no raw URLs, and a
 * plan with no brief has no citations at all. Pure; an empty list passes.
 */
export function checkLessonCitations(
  content: LessonContent,
  research: ResearchBrief | null,
): LessonIssue[] {
  const issues: LessonIssue[] = [];
  const known = new Set<string>(research?.sources.map((source) => source.key));

  const checkKey = (key: string, blockRef: string) => {
    if (!research) {
      issues.push({
        code: 'citation_without_brief',
        blockRef,
        message: `Cites ${key}, but the plan has no research brief to cite`,
        source: 'code',
      });
    } else if (!known.has(key)) {
      issues.push({
        code: 'unknown_source',
        blockRef,
        message: `Cites ${key}, which is not one of the plan's sources`,
        source: 'code',
      });
    }
  };

  const citedInline = new Set<string>();
  for (const { blockRef, text } of lessonTexts(content.blocks)) {
    if (RAW_URL_PATTERN.test(text)) {
      issues.push({
        code: 'raw_url',
        blockRef,
        message: 'Contains a URL; cite a source key such as [S1] instead',
        source: 'code',
      });
    }
    for (const key of new Set(markerKeys(text))) {
      citedInline.add(key);
      checkKey(key, blockRef);
    }
  }
  // Keys cited inline were reported at their block already.
  for (const key of content.sourceIds ?? []) {
    if (!citedInline.has(key)) {
      checkKey(key, 'sourceIds');
    }
  }

  return issues;
}
