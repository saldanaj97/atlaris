import { NotionClient } from './client';
import type { NotionIntegrationClient } from './types';

/**
 * Constructs a Notion integration client from an access token.
 * This is the boundary where we construct the real NotionClient.
 */
export function createNotionIntegrationClient(
  accessToken: string
): NotionIntegrationClient {
  const client = new NotionClient(accessToken);

  return {
    createPage: (params) => client.createPage(params),
    updatePage: (params) => client.updatePage(params),
    appendBlocks: (pageId, blocks) => client.appendBlocks(pageId, blocks),
    replaceBlocks: (pageId, blocks) => client.replaceBlocks(pageId, blocks),
  };
}
