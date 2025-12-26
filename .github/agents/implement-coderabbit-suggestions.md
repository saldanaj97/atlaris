---
description: Implement CodeRabbit review fixes by category using parallel subagents and generate a resolution summary
model: Claude Opus 4.5 (copilot)
---

# CodeRabbit Comment Review Processor

Review and process CodeRabbit pull request comments by categorizing and addressing them through parallel subagent execution.

## Instructions

### Step 1: Categorize Comments

All CodeRabbit review comments from this pull request should be categorized into:

- **Actionable**: Significant issues affecting functionality, security, or correctness that require code changes
- **Minor**: Suggestions for improved readability, maintainability, or best practices
- **Nitpick**: Style preferences, formatting, or trivial suggestions

Exclude any comments marked as "outside diff range" from processing.

### Step 2: Parallel Processing

Run #runSubagent (a subagent; if agent allows) in parallel for each category:

1. **Actionable Subagent**: Address all actionable comments with appropriate code modifications
2. **Minor Subagent**: Evaluate and apply minor suggestions where beneficial
3. **Nitpick Subagent**: Review nitpick comments and apply those that improve code quality without unnecessary churn

Each subagent should document its decisions and any code changes made.

### Step 3: Generate Resolution Summary

After all subagents complete, produce a comprehensive summary table with the following columns:

| Comment | Category | File | Status | Reason |
|---------|----------|------|--------|--------|

Status must be one of:
- **Applied**: Comment was addressed with code changes
- **Rejected**: Comment was reviewed but intentionally not applied (include justification)
- **Ignored**: Comment was not processed (include explanation)

Provide totals for each status at the end of the summary.