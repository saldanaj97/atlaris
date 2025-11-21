/**
 * Centralized Notion type imports
 *
 * NOTE: We import from @notionhq/client/build/src/api-endpoints which is an internal
 * build path. If future @notionhq/client upgrades break these imports, update them here.
 * All other files should import Notion types from this module to maintain a single source of truth.
 */
import type {
  BlockObjectRequest,
  CreatePageParameters,
  CreatePageResponse,
  UpdatePageParameters,
  UpdatePageResponse,
  AppendBlockChildrenResponse,
  ListBlockChildrenResponse,
  UpdateBlockResponse,
} from '@notionhq/client/build/src/api-endpoints';

// Re-export all Notion types so other modules can import from here
export type {
  BlockObjectRequest,
  CreatePageParameters,
  CreatePageResponse,
  UpdatePageParameters,
  UpdatePageResponse,
  AppendBlockChildrenResponse,
  ListBlockChildrenResponse,
  UpdateBlockResponse,
};

/**
 * Minimal interface for the Notion client used by exportPlanToNotion.
 * Only includes the methods actually used by our sync logic.
 */
export interface NotionIntegrationClient {
  createPage(params: CreatePageParameters): Promise<CreatePageResponse>;
  updatePage(params: UpdatePageParameters): Promise<UpdatePageResponse>;
  appendBlocks(
    pageId: string,
    blocks: BlockObjectRequest[]
  ): Promise<AppendBlockChildrenResponse>;
  replaceBlocks(
    pageId: string,
    blocks: BlockObjectRequest[]
  ): Promise<AppendBlockChildrenResponse>;
}
