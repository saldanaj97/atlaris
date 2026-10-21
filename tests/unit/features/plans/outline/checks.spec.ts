import type { ParsedModule } from '@/features/ai/types/parser.types';

import {
  checkOutlineCounts,
  checkOutlineDuplicates,
  checkOutlineSchema,
  checkOutlineScope,
  checkOutlineTime,
  normalizeTitle,
  runOutlineCodeChecks,
} from '@/features/plans/outline/checks';
import { describe, expect, it } from 'vitest';

const INPUT = {
  topic: 'TypeScript generics',
  skillLevel: 'beginner',
  learningStyle: 'mixed',
  weeklyHours: 5,
} as const;

function lesson(title: string, estimatedMinutes = 30) {
  return { title, estimatedMinutes };
}

function module(
  title: string,
  tasks = [lesson(`${title} lesson A`), lesson(`${title} lesson B`)],
): ParsedModule {
  return {
    title,
    estimatedMinutes: tasks.reduce(
      (sum, task) => sum + task.estimatedMinutes,
      0,
    ),
    tasks,
  };
}

/** Passes every check for `INPUT`. */
function cleanOutline(): ParsedModule[] {
  return [
    module('TypeScript types', [
      lesson('Primitive types'),
      lesson('Type inference'),
    ]),
    module('Generic functions', [
      lesson('Type parameters'),
      lesson('Generic constraints'),
    ]),
  ];
}

function codes(issues: readonly { code: string; blockRef: string }[]) {
  return issues.map((issue) => [issue.code, issue.blockRef]);
}

describe('outline code checks', () => {
  it('passes a clean outline', () => {
    expect(runOutlineCodeChecks(cleanOutline(), INPUT)).toEqual([]);
  });

  it('normalizes numbering, case and accents in titles', () => {
    expect(normalizeTitle('Module 2: Généric  Functions!')).toBe(
      'generic functions',
    );
  });

  describe('checkOutlineSchema', () => {
    it('reports each invalid field at its block', () => {
      const issues = checkOutlineSchema([
        { title: 'Types', estimatedMinutes: 60, tasks: [] },
        {
          title: 'Generics',
          estimatedMinutes: 60,
          tasks: [{ title: '', estimatedMinutes: 30 }],
        },
      ]);

      expect(codes(issues)).toEqual([
        ['schema_invalid', 'modules[0]'],
        ['schema_invalid', 'modules[1].tasks[0]'],
      ]);
      expect(issues.every((issue) => issue.source === 'code')).toBe(true);
    });

    it('reports a non-array outline at the plan', () => {
      expect(codes(checkOutlineSchema({ modules: [] }))).toEqual([
        ['schema_invalid', 'plan'],
      ]);
    });

    it('stops the other checks when the schema fails', () => {
      const broken = [
        { title: 'Types', estimatedMinutes: -1, tasks: [lesson('x')] },
      ] as ParsedModule[];

      expect(
        codes(runOutlineCodeChecks(broken, INPUT)).map(([code]) => code),
      ).toEqual(['schema_invalid']);
    });
  });

  describe('checkOutlineCounts', () => {
    it('flags too few modules and modules with too few or too many lessons', () => {
      const tooMany = Array.from({ length: 13 }, (_, index) =>
        lesson(`Generics drill ${index}`, 10),
      );

      expect(codes(checkOutlineCounts([module('Generics')]))).toEqual([
        ['module_count', 'plan'],
      ]);
      expect(
        codes(
          checkOutlineCounts([
            module('Types', [lesson('Only one')]),
            module('Generics', tooMany),
          ]),
        ),
      ).toEqual([
        ['lesson_count', 'modules[0]'],
        ['lesson_count', 'modules[1]'],
      ]);
    });
  });

  describe('checkOutlineDuplicates', () => {
    it('flags exact duplicates after numbering and case are removed', () => {
      const outline = [
        module('1. Generic functions'),
        module('Module 2: generic FUNCTIONS'),
      ];

      expect(codes(checkOutlineDuplicates(outline))).toContainEqual([
        'duplicate_title',
        'modules[1]',
      ]);
    });

    it('flags near-duplicate lesson titles across modules', () => {
      const outline = [
        module('TypeScript types', [
          lesson('Generic constraints in TypeScript'),
          lesson('Type inference'),
        ]),
        module('Generic functions', [
          lesson('TypeScript generic constraint'),
          lesson('Type parameters'),
        ]),
      ];

      expect(codes(checkOutlineDuplicates(outline))).toEqual([
        ['near_duplicate_title', 'modules[1].tasks[0]'],
      ]);
    });

    it('does not flag titles that share only a word', () => {
      expect(checkOutlineDuplicates(cleanOutline())).toEqual([]);
    });
  });

  describe('checkOutlineScope', () => {
    it('flags a module with no topic keyword', () => {
      const outline = [
        ...cleanOutline(),
        module('Sourdough baking', [
          lesson('Starter care'),
          lesson('Shaping loaves'),
        ]),
      ];

      expect(codes(checkOutlineScope(outline, INPUT.topic))).toEqual([
        ['off_topic_module', 'modules[2]'],
      ]);
    });

    it('matches keywords by prefix and lesson titles', () => {
      const outline = [
        module('Advanced patterns', [
          lesson('Generically typed APIs'),
          lesson('Variance'),
        ]),
      ];

      expect(checkOutlineScope(outline, INPUT.topic)).toEqual([]);
    });

    it('skips a topic with no keyword', () => {
      expect(checkOutlineScope(cleanOutline(), 'Go')).toEqual([]);
    });
  });

  describe('checkOutlineTime', () => {
    it('flags a module whose minutes differ from its lessons', () => {
      const outline = cleanOutline();
      outline[0] = { ...outline[0]!, estimatedMinutes: 240 };

      expect(codes(checkOutlineTime(outline, INPUT))).toEqual([
        ['module_time_mismatch', 'modules[0]'],
      ]);
    });

    it('flags a lesson longer than the weekly hours', () => {
      const outline = [
        module('TypeScript types', [
          lesson('Primitive types', 400),
          lesson('Type inference'),
        ]),
      ];

      expect(codes(checkOutlineTime(outline, INPUT))).toEqual([
        ['lesson_exceeds_weekly_hours', 'modules[0].tasks[0]'],
      ]);
    });

    it('flags a plan over the hours between start and deadline', () => {
      const outline = [
        module('TypeScript types', [lesson('A', 240), lesson('B', 240)]),
      ];
      const dated = {
        ...INPUT,
        weeklyHours: 5,
        startDate: '2026-11-02',
        deadlineDate: '2026-11-09',
      };

      expect(codes(checkOutlineTime(outline, dated))).toEqual([
        ['plan_exceeds_hours', 'plan'],
      ]);
    });

    it('skips the total without a start date', () => {
      const outline = [
        module('TypeScript types', [lesson('A', 240), lesson('B', 240)]),
      ];

      expect(
        checkOutlineTime(outline, { ...INPUT, deadlineDate: '2026-11-09' }),
      ).toEqual([]);
    });
  });
});
