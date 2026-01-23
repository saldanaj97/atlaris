import {
  mockPagesCreate,
  resetNotionMocks,
} from '../../mocks/unit/notion-client.unit';
import { describe, it, expect, beforeEach } from 'vitest';
import { NotionClient } from '@/lib/integrations/notion/client';

describe('NotionClient Rate Limiting', () => {
  let client: NotionClient;

  beforeEach(() => {
    resetNotionMocks();
    client = new NotionClient('test_access_token');
  });

  it('should enforce 3 requests per second limit', async () => {
    const start = Date.now();

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

    expect(elapsed).toBeGreaterThanOrEqual(1600);
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
