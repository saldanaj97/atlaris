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
    createPage: (...args) => client.createPage(...args),
    updatePage: (...args) => client.updatePage(...args),
    appendBlocks: (...args) => client.appendBlocks(...args),
    replaceBlocks: (...args) => client.replaceBlocks(...args),
  };
}
