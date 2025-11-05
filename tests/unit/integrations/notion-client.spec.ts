import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotionClient } from '@/lib/integrations/notion/client';
import { Client } from '@notionhq/client';

vi.mock('@notionhq/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@notionhq/client')>();
  return {
    ...actual,
    Client: vi.fn(),
  };
});

describe('NotionClient Rate Limiting', () => {
  let client: NotionClient;
  let mockPagesCreate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockPagesCreate = vi.fn().mockResolvedValue({ id: 'page_123' });
    (Client as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      pages: {
        create: mockPagesCreate,
      },
      blocks: {
        children: {
          append: vi.fn().mockResolvedValue({}),
        },
      },
    }));

    client = new NotionClient('test_access_token');
  });

  it('should enforce 3 requests per second limit', async () => {
    const start = Date.now();

    // Queue 6 requests
    const promises = Array(6)
      .fill(null)
      .map(() =>
        client.createPage({
          parent: { page_id: 'test' },
          properties: {},
        })
      );

    await Promise.all(promises);
    const elapsed = Date.now() - start;

    // 6 requests at 3 req/sec = 5 intervals * 333.33ms = ~1666ms minimum
    expect(elapsed).toBeGreaterThanOrEqual(1600); // Allow some tolerance
    expect(mockPagesCreate).toHaveBeenCalledTimes(6);
  });

  it('should handle API errors with retry', async () => {
    mockPagesCreate
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({ id: 'page_123' });

    const result = await client.createPage({
      parent: { page_id: 'test' },
      properties: {},
    });

    expect(mockPagesCreate).toHaveBeenCalledTimes(2);
    expect(result.id).toBe('page_123');
  });
});
