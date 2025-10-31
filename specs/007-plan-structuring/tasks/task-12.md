# Phase 12: Update AI Prompts to Request Time Estimates

**Files:**

- Modify: `src/lib/ai/prompts.ts`
- Test: Manual verification via plan generation

## Step 1: Review current prompts

Read `src/lib/ai/prompts.ts` to understand current structure.

## Step 2: Modify prompts to request time estimates and resources

Modify `src/lib/ai/prompts.ts` - add instructions for time estimates:

```typescript
// ... existing code

export const PLAN_GENERATION_PROMPT = `
You are an expert learning plan generator. Create a structured learning plan based on the user's requirements.

IMPORTANT: For each task, you MUST include:
1. A clear, actionable title
2. A detailed description
3. An estimated_minutes field (integer) indicating how long the task should take
4. At least one resource URL (preferably multiple) relevant to the task

Time Estimate Guidelines:
- Beginner tasks: typically 30-90 minutes
- Intermediate tasks: typically 60-180 minutes
- Advanced tasks: typically 90-240 minutes
- Adjust based on task complexity and scope

Resource Requirements:
- Every task MUST have at least one linked resource
- Prefer high-quality, free resources when possible
- Include a mix of resource types: videos, articles, documentation, interactive tutorials

Output Format:
{
  "modules": [
    {
      "title": "Module Title",
      "description": "Module description",
      "estimated_minutes": 360,
      "tasks": [
        {
          "title": "Task Title",
          "description": "Detailed task description",
          "estimated_minutes": 60,
          "resources": [
            {
              "title": "Resource Title",
              "url": "https://example.com/resource",
              "type": "video" // or "article", "doc", "course"
            }
          ]
        }
      ]
    }
  ]
}

User Requirements:
- Topic: {topic}
- Skill Level: {skillLevel}
- Weekly Hours: {weeklyHours}
- Learning Style: {learningStyle}

Generate a comprehensive, well-structured learning plan.
`;

// ... rest of prompts
```

## Step 3: Manual test via plan generation

Run: `pnpm dev` and create a test plan.
Expected: Generated plan includes `estimated_minutes` and resources for all tasks.

## Step 4: Commit

```bash
git add src/lib/ai/prompts.ts
git commit -m "feat: update AI prompts to request time estimates and resources"
```
