# Job Queue Seed Data Strategy

## Overview

Added comprehensive seed data generation for the `job_queue` table in `src/lib/db/seed.ts`.

## Implementation Details

### Data Volume

- **~40% of plans** get associated job queue entries
- **~20% additional jobs** without planId (pending jobs that haven't created plans yet)
- Total: Approximately **48% of plan count** in job entries

### Status Distribution

The seeded jobs follow a realistic distribution:

| Status       | Percentage | Description                           |
| ------------ | ---------- | ------------------------------------- |
| `pending`    | 15%        | Fresh jobs waiting to be processed    |
| `processing` | 10%        | Currently being worked on by a worker |
| `completed`  | 60%        | Successfully finished jobs            |
| `failed`     | 15%        | Jobs that failed after max attempts   |

### Job Characteristics by Status

#### Pending Jobs

- **Attempts**: 0
- **Priority**: Random 0-9 (for queue ordering)
- **Scheduled**: Within last 48 hours
- **Locked**: No
- No `startedAt`, `completedAt`, or `result`

#### Processing Jobs

- **Attempts**: 1-2
- **Priority**: 0
- **Started**: Recently (2025-09-29)
- **Locked**: Yes, by `worker-1` through `worker-5`
- Has `lockedAt` and `lockedBy`
- No `completedAt` yet

#### Completed Jobs

- **Attempts**: 1-2
- **Scheduled**: 1-14 days ago
- **Started & Completed**: Set to realistic timestamps
- **Result**: JSON object with:
  - `planId`: Associated plan UUID
  - `modulesCount`: 4-6 modules
  - `tasksCount`: 18-30 tasks
  - `durationMs`: 12-20 seconds

#### Failed Jobs

- **Attempts**: 3 (maxed out)
- **Scheduled**: 1-14 days ago
- **Completed**: Set to failure time
- **Error**: One of:
  - "AI provider timeout"
  - "Invalid response format"
  - "Rate limit exceeded"
  - "Validation error: topic too vague"
  - "Network error: connection refused"

### Payload Structure

All jobs have realistic payload data:

```json
{
  "topic": "Learn Advanced TypeScript",
  "skillLevel": "beginner|intermediate|advanced",
  "weeklyHours": 3-12,
  "learningStyle": "reading|video|practice|mixed",
  "requestId": "req_timestamp_index"
}
```

### Orphan Jobs

~20% of jobs don't have a `planId` yet, representing:

- Jobs that are pending and haven't created their plan
- Failed jobs that never got to plan creation
- More realistic queue simulation

## Testing with Supabase MCP

You can verify the seeded data with queries like:

```sql
-- Status distribution
SELECT status, COUNT(*) as count
FROM job_queue
GROUP BY status
ORDER BY status;

-- Recent pending jobs
SELECT id, priority, scheduled_for, payload->>'topic' as topic
FROM job_queue
WHERE status = 'pending'
ORDER BY priority DESC, scheduled_for ASC
LIMIT 10;

-- Failed jobs with errors
SELECT payload->>'topic' as topic, error, attempts
FROM job_queue
WHERE status = 'failed';

-- Processing jobs (locked)
SELECT locked_by, COUNT(*) as active_jobs
FROM job_queue
WHERE status = 'processing'
GROUP BY locked_by;
```

## Integration Points

The seed data integrates with:

- **Users table**: Every job has a valid `userId`
- **Learning Plans table**: ~80% of jobs link to existing plans
- **Realistic workflows**: Status transitions match real background worker behavior

## Future Enhancements

Consider adding:

- Scheduled jobs (future `scheduledFor` timestamps)
- Different job types when added to the enum
- Retry patterns with increasing `attempts`
- Worker capacity simulation
