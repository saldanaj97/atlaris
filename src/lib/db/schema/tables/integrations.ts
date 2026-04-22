import { sql } from 'drizzle-orm';
import {
	index,
	pgPolicy,
	pgTable,
	text,
	timestamp,
	uuid,
} from 'drizzle-orm/pg-core';

import { currentUserId } from './common';

/**
 * OAuth state tokens for CSRF protection during OAuth flows.
 *
 * This table stores short-lived tokens that map OAuth state parameters to auth user IDs.
 * The tokens are:
 * - Hashed (SHA-256) before storage for security
 * - Single-use (deleted on validation via atomic DELETE...RETURNING)
 * - Short-lived (10 minute TTL, enforced at query time)
 *
 * This replaces the previous in-memory LRU cache which failed in multi-instance
 * serverless deployments (e.g., Vercel) where OAuth initiation and callback
 * could land on different instances.
 */
export const oauthStateTokens = pgTable(
	'oauth_state_tokens',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		// SHA-256 hash of the state token (never store plaintext)
		stateTokenHash: text('state_token_hash').notNull(),
		// Auth user ID who initiated the OAuth flow
		authUserId: text('auth_user_id').notNull(),
		// Optional: which OAuth provider this token is for (for debugging/analytics)
		provider: text('provider'),
		// When this token expires (10 minutes from creation)
		expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
		createdAt: timestamp('created_at', { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index('oauth_state_tokens_hash_idx').on(table.stateTokenHash),
		index('oauth_state_tokens_expires_at_idx').on(table.expiresAt),
		pgPolicy('oauth_state_tokens_insert', {
			for: 'insert',
			to: 'authenticated',
			withCheck: sql`${table.authUserId} = ${currentUserId}`,
		}),
		pgPolicy('oauth_state_tokens_select', {
			for: 'select',
			to: 'authenticated',
			using: sql`${table.authUserId} = ${currentUserId}`,
		}),
		pgPolicy('oauth_state_tokens_delete', {
			for: 'delete',
			to: 'authenticated',
			using: sql`${table.authUserId} = ${currentUserId}`,
		}),
	],
).enableRLS();
