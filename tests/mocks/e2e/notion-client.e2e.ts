import { vi } from 'vitest';

vi.mock('@notionhq/client', () => ({
  Client: vi.fn().mockImplementation(() => ({
    pages: {
      create: vi.fn().mockResolvedValue({
        id: 'notion_page_e2e',
        object: 'page',
        created_time: new Date().toISOString(),
        last_edited_time: new Date().toISOString(),
      }),
    },
  })),
}));
