// tests/mocks/integration/notion-client.integration.ts
import { vi } from 'vitest';
import { Client } from '@notionhq/client';

// Shared mock functions
const mockUpdatePage = vi.fn().mockResolvedValue({ id: 'notion_page_123' });
const mockAppendBlocks = vi.fn().mockResolvedValue({});
const mockListChildren = vi.fn().mockResolvedValue({
  object: 'list',
  results: [],
  next_cursor: null,
  has_more: false,
  type: 'block',
});
const mockUpdateBlock = vi.fn().mockResolvedValue({});

// Global mock for @notionhq/client used across integration tests
vi.mock('@notionhq/client', () => {
  return {
    Client: vi.fn(() => ({
      pages: {
        update: mockUpdatePage,
      },
      blocks: {
        update: mockUpdateBlock,
        children: {
          append: mockAppendBlocks,
          list: mockListChildren,
        },
      },
    })),
  };
});

export { mockUpdatePage, mockAppendBlocks, mockListChildren, mockUpdateBlock };
