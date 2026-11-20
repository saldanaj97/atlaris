import {
  BASELINE_PATH,
  COMMENT_ROOT,
  commentHash,
  isDirective,
  readBaseline,
} from './comments/shared.mjs';
import path from 'node:path';

let cachedBaseline;

function baselineFor(relative) {
  cachedBaseline ??= readBaseline(process.cwd());
  return cachedBaseline.files?.[relative] ?? {};
}

const noComments = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Ban code comments under src/. Existing comments are ratcheted down through the baseline file.',
    },
    schema: [],
  },
  create(context) {
    const relative = path
      .relative(process.cwd(), context.filename)
      .split(path.sep)
      .join('/');
    if (!relative.startsWith(`${COMMENT_ROOT}/`)) return {};

    return {
      Program() {
        const allowed = { ...baselineFor(relative) };
        for (const comment of context.sourceCode.getAllComments()) {
          if (isDirective(comment.value)) continue;
          const hash = commentHash(comment.value);
          if (allowed[hash] > 0) {
            allowed[hash] -= 1;
            continue;
          }
          context.report({
            loc: comment.loc,
            message: `Comments are banned in ${COMMENT_ROOT}/. Delete it; if it records a non-obvious decision, write an ADR in docs/adr/ instead. Never add to ${BASELINE_PATH}. See the delete-comment skill.`,
          });
        }
      },
    };
  },
};

export default {
  meta: { name: 'atlaris-comments' },
  rules: { 'no-comments': noComments },
};
