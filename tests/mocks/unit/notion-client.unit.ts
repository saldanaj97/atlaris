import { vi } from 'vitest';

vi.mock('@notionhq/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@notionhq/client')>();
  return {
    ...actual,
    Client: vi.fn(),
  };
});
