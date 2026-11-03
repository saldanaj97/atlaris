import type { LessonContent } from '@/shared/types/lesson-content.types';

import { expect, renderedContrast, test } from './fixtures';
import { LOCAL_PRODUCT_TESTING_SEED_AUTH_USER_ID } from '@/lib/config/local-product-testing';
import { readSmokeStateFromEnv } from '@tests/helpers/smoke/state-file';
import postgres from 'postgres';

const MIN_TEXT_CONTRAST = 4.5;
const LESSON_TITLE = 'Markdown lesson';

const LESSON_CONTENT: LessonContent = {
  version: 1,
  blocks: [
    {
      type: 'paragraph',
      text: '`CREATE TABLE` defines columns.\nThe second line stays on its own line.',
    },
    {
      type: 'example',
      title: 'Worked example',
      text: [
        'Result:',
        '| id | name |',
        '|---|---|',
        '| 1 | Ada |',
        '',
        '```sql',
        'SELECT id,',
        '    name',
        'FROM users_with_a_very_long_table_name_that_cannot_wrap_inside_a_narrow_phone_screen;',
        '```',
        '',
        '+----+',
        '| id |',
        '+----+',
      ].join('\n'),
    },
    { type: 'completion_criteria', items: ['Explain `JOIN` order'] },
  ],
};

let sql: postgres.Sql;
let planId: string;
let moduleId: string;

test.beforeAll(async () => {
  sql = postgres(readSmokeStateFromEnv().POSTGRES_URL, { max: 1 });
  const [plan] = await sql<{ id: string }[]>`
    INSERT INTO learning_plans
      (user_id, topic, skill_level, weekly_hours, learning_style, generation_status)
    SELECT id, 'Lesson text smoke', 'beginner', 5, 'reading', 'ready'
    FROM users WHERE auth_user_id = ${LOCAL_PRODUCT_TESTING_SEED_AUTH_USER_ID}
    RETURNING id`;
  planId = plan.id;
  const [module] = await sql<{ id: string }[]>`
    INSERT INTO modules
      (plan_id, "order", title, estimated_minutes, lesson_generation_status)
    VALUES (${planId}, 1, 'Lesson text module', 30, 'ready')
    RETURNING id`;
  moduleId = module.id;
  await sql`
    INSERT INTO tasks (module_id, "order", title, estimated_minutes, lesson_content)
    VALUES (${moduleId}, 1, ${LESSON_TITLE}, 30, ${sql.json(LESSON_CONTENT)})`;
});

test.afterAll(async () => {
  await sql`DELETE FROM learning_plans WHERE id = ${planId}`;
  await sql.end();
});

for (const colorScheme of ['light', 'dark'] as const) {
  test(`lesson Markdown renders in ${colorScheme}`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 900 });
    await page.emulateMedia({ colorScheme });
    await page.goto(`/plans/${planId}/modules/${moduleId}`);
    await expect(page.locator('html')).toHaveAttribute(
      'data-atlaris-theme',
      colorScheme,
    );

    const trigger = page.getByRole('button', { name: LESSON_TITLE });
    if ((await trigger.getAttribute('aria-expanded')) !== 'true') {
      await trigger.click();
    }

    // Inline code loses its backticks, and the line break survives rendering.
    const inlineCode = page.locator('code', { hasText: 'CREATE TABLE' });
    await expect(inlineCode).toHaveText('CREATE TABLE');
    const paragraph = page.locator('p', { has: inlineCode });
    expect(await paragraph.innerText()).toBe(
      'CREATE TABLE defines columns.\nThe second line stays on its own line.',
    );

    // The pipe table is a real table, with no separator row left in the text.
    const table = page.getByRole('table');
    await expect(
      table.getByRole('columnheader', { name: 'name' }),
    ).toBeVisible();
    const cell = table.getByRole('cell', { name: 'Ada' });
    await expect(cell).toBeVisible();
    await expect(page.getByText('|---|')).toHaveCount(0);

    // Fenced code keeps its indentation and drops the fence.
    const codeBlock = page.locator('pre', { hasText: 'SELECT id,' });
    expect(await codeBlock.innerText()).toContain('SELECT id,\n    name\n');
    await expect(page.getByText('```')).toHaveCount(0);

    // An ASCII box table stays aligned in its own block.
    await expect(page.locator('pre', { hasText: '+----+' })).toHaveText(
      '+----+\n| id |\n+----+',
    );

    await expect(page.locator('code', { hasText: /^JOIN$/ })).toBeVisible();

    for (const text of [inlineCode, cell, codeBlock]) {
      expect(await text.evaluate(renderedContrast)).toBeGreaterThanOrEqual(
        MIN_TEXT_CONTRAST,
      );
    }

    // Long code scrolls inside its own block, not the page.
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    expect(
      await page
        .getByRole('region', { name: 'Code example' })
        .first()
        .evaluate((region) => region.scrollWidth > region.clientWidth),
    ).toBe(true);
  });
}
