import { vi } from 'vitest';

export const mockPagesCreate = vi.fn().mockResolvedValue({ id: 'page_123' });
export const mockBlocksChildrenAppend = vi.fn().mockResolvedValue({});

export function resetNotionMocks(): void {
  mockPagesCreate.mockClear().mockResolvedValue({ id: 'page_123' });
  mockBlocksChildrenAppend.mockClear().mockResolvedValue({});
}

class MockNotionClient {
  pages = {
    create: mockPagesCreate,
  };
  blocks = {
    children: {
      append: mockBlocksChildrenAppend,
    },
  };
}

vi.mock('@notionhq/client', () => ({
  Client: MockNotionClient,
}));
