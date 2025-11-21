import { vi } from 'vitest';
import type {
  NotionIntegrationClient,
  CreatePageParameters,
  CreatePageResponse,
  UpdatePageParameters,
  UpdatePageResponse,
  BlockObjectRequest,
  AppendBlockChildrenResponse,
} from '@/lib/integrations/notion/types';

/**
 * Creates a mock Notion client for integration and E2E tests.
 * This provides a consistent mock shape across all Notion-related tests.
 */
export function createMockNotionClient(): NotionIntegrationClient & {
  _mocks: {
    createPage: ReturnType<typeof vi.fn>;
    updatePage: ReturnType<typeof vi.fn>;
    appendBlocks: ReturnType<typeof vi.fn>;
    replaceBlocks: ReturnType<typeof vi.fn>;
    listChildren: ReturnType<typeof vi.fn>;
  };
} {
  const mockUpdatePage = vi.fn().mockResolvedValue({ id: 'notion_page_123' });
  const mockAppendBlocks = vi.fn().mockResolvedValue({});
  const mockListChildren = vi.fn().mockResolvedValue({
    object: 'list',
    results: [],
    next_cursor: null,
    has_more: false,
    type: 'block',
  });
  const mockCreatePage = vi
    .fn()
    .mockResolvedValue({ id: 'notion_page_123' } as CreatePageResponse);
  const mockReplaceBlocks = vi
    .fn()
    .mockImplementation(
      async (pageId: string, blocks: BlockObjectRequest[]) => {
        await mockListChildren();
        await mockAppendBlocks(pageId, blocks);
        return {
          type: 'block' as const,
          block: {},
          object: 'list' as const,
          next_cursor: null,
          has_more: false,
          results: [],
        } as AppendBlockChildrenResponse;
      }
    );

  return {
    createPage: mockCreatePage as any,
    updatePage: mockUpdatePage as any,
    appendBlocks: mockAppendBlocks as any,
    replaceBlocks: mockReplaceBlocks as any,
    _mocks: {
      createPage: mockCreatePage,
      updatePage: mockUpdatePage,
      appendBlocks: mockAppendBlocks,
      replaceBlocks: mockReplaceBlocks,
      listChildren: mockListChildren,
    },
  };
}

/**
 * Creates a simple mock Notion client for E2E tests with minimal implementation.
 * Use this when you need full control over return values.
 */
export function createSimpleMockNotionClient(
  pageId = 'notion_page_e2e'
): NotionIntegrationClient {
  return {
    async createPage(
      _params: CreatePageParameters
    ): Promise<CreatePageResponse> {
      return {
        id: pageId,
        url: `https://notion.so/${pageId}`,
      } as CreatePageResponse;
    },

    async updatePage(
      params: UpdatePageParameters
    ): Promise<UpdatePageResponse> {
      return {
        id: params.page_id,
      } as UpdatePageResponse;
    },

    async appendBlocks(
      _pageId: string,
      _blocks: BlockObjectRequest[]
    ): Promise<AppendBlockChildrenResponse> {
      return {
        type: 'block' as const,
        block: {},
        object: 'list' as const,
        next_cursor: null,
        has_more: false,
        results: [],
      } as AppendBlockChildrenResponse;
    },

    async replaceBlocks(
      _pageId: string,
      _blocks: BlockObjectRequest[]
    ): Promise<AppendBlockChildrenResponse> {
      return {
        type: 'block' as const,
        block: {},
        object: 'list' as const,
        next_cursor: null,
        has_more: false,
        results: [],
      } as AppendBlockChildrenResponse;
    },
  };
}
