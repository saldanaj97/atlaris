# Supabase Database Performance Fixes - September 26, 2025

## Performance Issues Identified

### 1. RLS Policy Inconsistency (Critical)
**Location**: `src/lib/db/schema.ts` line 960
**Issue**: `plan_generations_update_own` policy uses `authUid` instead of `clerkSub`
**Impact**: Policy will fail at runtime since `authUid` is not defined for Clerk authentication
**Fix**: Change `${authUid}` to `${clerkSub}` to match other policies

### 2. Missing Composite Indexes (High Priority)
**Issue**: Several query patterns lack optimal indexes
**Locations**:
- `task_progress(user_id, task_id)` - frequent joins in progress queries
- `task_resources(task_id, order)` - ordering queries in detail views
- `modules(plan_id, order)` - already exists, good
- `tasks(module_id, order)` - already exists, good

### 3. N+1 Query Patterns (Medium Priority)
**Location**: `src/lib/db/queries/plans.ts`
**Issues**:
- `getLearningPlanDetail()` performs 5 separate queries instead of joins
- `getPlanSummariesForUser()` performs 4 separate queries
**Impact**: Multiple round trips to database
**Fix**: Optimize with proper joins where possible

### 4. Suboptimal RLS Patterns (Medium Priority)
**Issue**: Repeated expensive subqueries in RLS policies
**Pattern**: `SELECT id FROM users WHERE clerkUserId = clerkSub` appears frequently
**Impact**: Expensive subquery execution on every policy check
**Fix**: Consider using direct user ID comparisons where possible

### 5. Inconsistent Formatting (Low Priority)
**Issue**: Inconsistent spacing in RLS policies
**Locations**: Various policies have extra blank lines (e.g., lines 282, 441, 666, 844, 907)

## Implementation Plan

1. **Fix Critical RLS Policy Bug** - Immediate fix needed
2. **Add Missing Composite Indexes** - Significant performance improvement  
3. **Query Optimization** - Reduce N+1 patterns where feasible
4. **Code Cleanup** - Fix formatting consistency

## Notes
- User requested NO MIGRATION PUSHES - they will handle migrations
- Focus on schema.ts changes and query optimizations
- Test changes don't break existing functionality