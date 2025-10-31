# [Feature] Implement Week-Based Plan Structuring with Dated Schedules

**Issue:** [#35](https://github.com/saldanaj97/atlaris/issues/35)
**Status:** Open
**Milestone:** MVP 1.0
**Labels:** enhancement, mvp

## Description

Transform the current module/task structure into a week-based milestone system with derived session and day breakdowns. Generate a dated schedule showing when users should complete each task. Ensure every task has at least one linked resource and surface time estimates with rich schedule context in the UI.

This feature enables users to visualize their learning journey as a concrete, time-bound schedule rather than an abstract list of modules and tasks. By providing specific dates and week-based milestones, users can better plan their time and track progress toward their learning goals.

## Acceptance Criteria

- [ ] Week-based milestones generated with session/day breakdowns
- [ ] Dated schedule shows specific dates for each task completion
- [ ] Every task validated to have at least one linked resource
- [ ] UI displays time estimates with schedule context (e.g., "Week 2, Day 3 - 45 min")
- [ ] Schedule adapts to user's start date and deadline

## Test Outcomes (Plain English)

### Unit Tests

- Date calculation correctly derives week/day/session from start date
- Milestone generation creates appropriate week boundaries
- Resource validation ensures every task has e1 resource link
- Time estimate formatting includes schedule context
- Week number calculation handles edge cases (year boundaries, leap years)
- Session distribution logic allocates sessions evenly across available days
- Timezone-aware date calculations produce consistent results

### Integration Tests

- Full plan generation creates week-based structure with all dates calculated
- Schedule respects user's start date and distributes tasks evenly
- Generated plan passes resource validation (no tasks without resources)
- UI receives properly formatted schedule data
- Plan regeneration maintains schedule consistency
- Database queries efficiently fetch week-based plan data
- Schedule calculation integrates with user's weekly hours preference

### E2E Tests

- User views generated plan and sees week-based milestones with specific dates
- Each task displays time estimate with schedule context
- Clicking a task shows linked resources
- Schedule adapts when user changes start date or deadline
- Calendar view displays tasks on their scheduled dates
- Week navigation shows correct tasks for each week
- User can see their current week and upcoming milestones

## Technical Notes

**Relevant Files/Locations:**

- `src/lib/ai/orchestrator.ts` - Generate week-based structure
- `src/lib/ai/prompts.ts` - Update prompts to request weekly breakdowns
- `src/lib/db/schema.ts` - May need fields for week_number, session_date
- `src/lib/db/queries/**` - Add queries for schedule calculation
- `src/components/plans/` - UI components for schedule display
- Create new: `src/lib/scheduling/` - Date calculation and schedule generation
- Create new: `src/lib/scheduling/milestones.ts` - Week/milestone logic

**Implementation Considerations:**

- Week 1 starts on user's start date (or plan creation date if no start date)
- Sessions distributed across available days (e.g., M/W/F if 3 sessions/week)
- Handle edge cases: holidays, weekends, user availability patterns
- Validate resource links in post-processing if AI doesn't guarantee them
- Schedule UI should be scannable: timeline view, calendar view, or list view
- Consider timezone handling for date calculations (use user's timezone)
- Use date-fns for consistent date manipulation across the app
- Cache calculated schedules to avoid recomputing on every request
- Ensure schedule calculations are deterministic for testing

## Dependencies

This feature depends on:

- Onboarding deadline and start date collection (not yet implemented - see MVP Open Items)
- Content Engine resource curation (not yet implemented - see MVP Open Items)

Note: These dependencies are tracked in the MVP Open Items document but don't have dedicated issues yet.

## References

### File Paths/References

- `/Users/juansaldana/Projects/atlaris/docs/project-info/mvp-open-items.md` - Source requirements (Plan Structuring section)
- `/Users/juansaldana/Projects/atlaris/src/lib/db/schema.ts` - Current database schema for modules and tasks
- `/Users/juansaldana/Projects/atlaris/src/components/plans/` - Existing plan UI components

### Context7 MCP References

**date-fns Documentation** (`/date-fns/date-fns`):

- Use context7 MCP to grab documentation for date-fns focusing on week calculations, date arithmetic (add/subtract days), and date formatting
- Key functions: `addDays`, `addWeeks`, `startOfWeek`, `endOfWeek`, `differenceInDays`, `format`
- Week-related utilities for calculating week boundaries and week numbers
- Locale-aware date formatting for displaying dates in user's preferred format

**Day.js Documentation** (`/iamkun/dayjs`):

- Use context7 MCP to grab documentation for Day.js as a lightweight alternative to date-fns
- Focus on week of year plugin, date manipulation (add/subtract), and custom formatting
- Smaller bundle size (2kB) may be preferable for client-side date calculations
- Note: Day.js requires plugins for advanced features like week-of-year

**React Big Calendar** (`/jquense/react-big-calendar`):

- Use context7 MCP to grab documentation for react-big-calendar focusing on custom week views, timeline rendering, and event scheduling
- Provides pre-built calendar UI components with week/day/month views
- Supports resource scheduling which could be adapted for learning tasks
- Consider for timeline/calendar visualization of the learning schedule

### Web Search References

**Week-Based Learning Plan UI Best Practices**:

- Modern UI/UX design emphasizes clarity, simplicity, visual hierarchy, and consistent feedback mechanisms
- Progress tracking should use clear visual indicators (step trackers, completion percentages) to encourage engagement
- Calendar interfaces benefit from multiple views (day, week, month, agenda) with auto-layout and dark/light mode support
- Visual hierarchy guides attention through size, color, and contrast; use whitespace for logical groupings
- For 2025, focus on minimalism, accessibility, personalization, and responsive design
- Source: https://www.capicua.com/blog/ui-and-ux-best-practices

**Milestone Tracking and Roadmap Visualization**:

- Gantt charts effectively map phases, milestones, and deadlines for at-a-glance project visibility
- Milestones displayed as critical checkpoints (often diamond shapes) help teams identify key dates quickly
- Effective roadmaps include themes, high-level timelines, and progress markers
- Visual roadmaps improve information absorption; most people process visuals better than text
- Breaking projects into manageable stages with milestone markers enhances clarity and accountability
- Source: https://medium.com/design-bootcamp/ux-roadmap-a-casual-guide-to-charting-your-design-journey-d25918fe6aa8

**Educational Platform Calendar Interfaces**:

- Educational calendar platforms provide comprehensive academic year views including holidays, events, and important dates
- Key features: multiple calendar views (month/week/day/agenda), drag-and-drop scheduling, calendar filters
- "Create Once, Publish Everywhere" approach automatically syncs updates across platforms
- Mobile-friendly interfaces enable staff and students to stay updated anytime, anywhere
- Integration with existing systems (LMS, CMS) ensures everyone stays informed and aligned
- Source: https://www.finalsite.com/school-websites/cms-for-schools/calendars

---

This issue tracks the overall Plan Structuring feature area. Specific implementation tasks will be broken down into sub-issues.
