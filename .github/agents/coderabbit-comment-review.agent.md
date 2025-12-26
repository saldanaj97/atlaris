---
description: Parse and categorize code review comments from a GitHub PR review into actionable, minor, and nitpick sections
model: Claude Opus 4.5 (copilot)
---

# CodeRabbit PR Comment Review Parser

## Task

Analyze the provided GitHub Pull Request review and extract all review comments, categorizing them by severity level.

## Input

**PR Review URL:** ${input:pr_review_url}

## Instructions

1. Navigate to the provided PR review URL and retrieve all code review comments
2. Categorize each comment into one of the following severity levels:
   - **Actionable**: Critical issues requiring immediate attention (bugs, security concerns, breaking changes, significant logic errors)
   - **Minor**: Improvements that should be addressed but are not critical (code quality, minor refactoring, documentation gaps)
   - **Nitpick**: Style preferences, formatting suggestions, or optional enhancements
3. For each comment, identify:
   - The file path where the comment was left
   - The specific line number(s) referenced
   - The original comment content
   - A clear description of the issue
   - Opinion on whether the comment is valid(will it improve the codebase or is it just a preference?)
   - The suggested fix (use the reviewer's suggestion if provided, otherwise propose an appropriate solution)
4. Note that files may contain multiple comments—ensure all are captured
5. If a comment lacks an explicit fix or suggestion, provide a reasonable solution based on the context and best practices

## Output Format

Present the results in the following markdown structure:

```markdown
## Actionable Comments

### 1. `path/to/filename.ext`
- **Line Numbers:** L{start}-L{end}
- **Comment:** {original comment text}
- **Description:** {explanation of the issue}
- **Validity:** {valid/invalid opinion}
- **Suggested Fix:** {proposed solution or code change}

### 2. `path/to/another-file.ext`
- **Line Numbers:** L{line}
- **Comment:** {original comment text}
- **Description:** {explanation of the issue}
- **Validity:** {valid/invalid opinion}
- **Suggested Fix:** {proposed solution or code change}

---

## Minor Comments

### 1. `path/to/filename.ext`
- **Line Numbers:** L{start}-L{end}
- **Comment:** {original comment text}
- **Description:** {explanation of the issue}
- **Validity:** {valid/invalid opinion}
- **Suggested Fix:** {proposed solution or code change}

---

## Nitpick Comments

### 1. `path/to/filename.ext`
- **Line Numbers:** L{start}-L{end}
- **Comment:** {original comment text}
- **Description:** {explanation of the issue}
- **Validity:** {valid/invalid opinion}
- **Suggested Fix:** {proposed solution or code change}

---

## Summary

| Category   | Count |
|------------|-------|
| Actionable | {n}   |
| Minor      | {n}   |
| Nitpick    | {n}   |
| **Total**  | {n}   |
```

If a category has no comments, include the section header with "No comments in this category."