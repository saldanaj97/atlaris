import { type SQL, sql } from 'drizzle-orm';
import type { AnyPgColumn, AnyPgTable } from 'drizzle-orm/pg-core';

import { currentUserId } from './tables/common';
import { users } from './tables/users';

type BasePlanParams = {
  planIdColumn: AnyPgColumn;
  planTable: AnyPgTable;
  planIdReferenceColumn: AnyPgColumn;
};

/**
 * Shared SQL fragments for RLS policies that validate user ownership or plan visibility.
 * Keeps the table definitions easier to scan and eliminates duplicated SQL strings that are easy to mistype.
 */

/**
 * SQL fragment that ensures a row belongs to the current authenticated user.
 */
export const recordOwnedByCurrentUser = (userIdColumn: AnyPgColumn): SQL =>
  sql`
    ${userIdColumn} IN (
      SELECT id FROM ${users} WHERE ${users.authUserId} = ${currentUserId}
    )
  `;

type PlanOwnershipParams = BasePlanParams & {
  planUserIdColumn: AnyPgColumn;
};

/**
 * SQL fragment that ensures the referenced plan belongs to the current user.
 */
export const planOwnedByCurrentUser = ({
  planIdColumn,
  planTable,
  planIdReferenceColumn,
  planUserIdColumn,
}: PlanOwnershipParams): SQL =>
  sql`
    EXISTS (
      SELECT 1 FROM ${planTable}
      WHERE ${planIdReferenceColumn} = ${planIdColumn}
      AND ${planUserIdColumn} IN (
        SELECT id FROM ${users} WHERE ${users.authUserId} = ${currentUserId}
      )
    )
  `;

/**
 * Utility to compose ad-hoc conditions with parentheses in callers.
 */
export const wrapCondition = (condition: SQL): SQL => sql`(${condition})`;
