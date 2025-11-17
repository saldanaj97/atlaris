import { sql, type SQL } from 'drizzle-orm';
import type { AnyPgColumn, AnyPgTable } from 'drizzle-orm/pg-core';

import { clerkSub } from './tables/common';
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
 * SQL fragment that ensures a row belongs to the current authenticated Clerk user.
 */
export const recordOwnedByCurrentUser = (userIdColumn: AnyPgColumn) =>
  sql`
    ${userIdColumn} IN (
      SELECT id FROM ${users} WHERE ${users.clerkUserId} = ${clerkSub}
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
}: PlanOwnershipParams) =>
  sql`
    EXISTS (
      SELECT 1 FROM ${planTable}
      WHERE ${planIdReferenceColumn} = ${planIdColumn}
      AND ${planUserIdColumn} IN (
        SELECT id FROM ${users} WHERE ${users.clerkUserId} = ${clerkSub}
      )
    )
  `;

type PlanVisibilityParams = BasePlanParams & {
  planVisibilityColumn: AnyPgColumn;
};

/**
 * SQL fragment that resolves whether the referenced plan is public.
 */
export const planIsPublic = ({
  planIdColumn,
  planTable,
  planIdReferenceColumn,
  planVisibilityColumn,
}: PlanVisibilityParams) =>
  sql`
    EXISTS (
      SELECT 1 FROM ${planTable}
      WHERE ${planIdReferenceColumn} = ${planIdColumn}
      AND ${planVisibilityColumn} = 'public'
    )
  `;

type PlanAndUserOwnershipParams = PlanOwnershipParams & {
  userIdColumn: AnyPgColumn;
};

/**
 * SQL fragment that ensures both the record owner and related plan owner are the current user.
 */
export const userAndPlanOwnedByCurrentUser = ({
  userIdColumn,
  ...planParams
}: PlanAndUserOwnershipParams) => {
  const userOwnership = recordOwnedByCurrentUser(userIdColumn);
  const planOwnership = planOwnedByCurrentUser(planParams);
  return sql`${userOwnership} AND ${planOwnership}`;
};

/**
 * Utility to compose ad-hoc conditions with parentheses in callers.
 */
export const wrapCondition = (condition: SQL) => sql`(${condition})`;
