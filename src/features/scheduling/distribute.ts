import { addDaysToDate, getWeekBoundaries } from '@/features/scheduling/dates';
import type {
  Day,
  ScheduleInputs,
  ScheduleJson,
  SessionAssignment,
  Week,
} from '@/shared/types/scheduling.types';

const DEFAULT_SESSIONS_PER_WEEK = 3;
const SESSION_DAYS_OFFSET = [0, 2, 4]; // Mon, Wed, Fri (0=Mon, 2=Wed, 4=Fri)

type ScheduleTask = ScheduleInputs['tasks'][number];

type AllocationState = {
  tasks: ScheduleTask[];
  taskIndex: number;
  remainingTaskMinutes: number;
};

function validateScheduleInputs(inputs: ScheduleInputs) {
  if (inputs.weeklyHours <= 0) {
    throw new Error('weeklyHours must be greater than 0');
  }

  if (!Array.isArray(inputs.tasks)) {
    throw new Error('tasks must be an array');
  }

  for (const task of inputs.tasks) {
    if (task.estimatedMinutes < 0) {
      throw new Error(
        `Task "${task.id}" has invalid estimatedMinutes: must be non-negative`,
      );
    }
  }
}

function getPositiveTasksInOrder(tasks: ScheduleTask[]) {
  return tasks
    .filter((task) => task.estimatedMinutes > 0)
    .toSorted((a, b) => a.order - b.order);
}

function buildSessionAssignment(
  task: ScheduleTask,
  estimatedMinutes: number,
): SessionAssignment {
  return {
    taskId: task.id,
    taskTitle: task.title,
    estimatedMinutes,
    moduleId: task.moduleId,
    moduleName: task.moduleTitle || `Module ${task.moduleId}`,
  };
}

function allocateSessionTasks(
  state: AllocationState,
  sessionMinutes: number,
): SessionAssignment[] {
  const assignments: SessionAssignment[] = [];
  let allocatedMinutes = 0;

  while (
    allocatedMinutes < sessionMinutes &&
    state.taskIndex < state.tasks.length
  ) {
    const currentTask = state.tasks[state.taskIndex];
    const remainingSessionCapacity = sessionMinutes - allocatedMinutes;
    const minutesToAllocate = Math.min(
      state.remainingTaskMinutes,
      remainingSessionCapacity,
    );

    if (minutesToAllocate <= 0) {
      break;
    }

    assignments.push(buildSessionAssignment(currentTask, minutesToAllocate));
    allocatedMinutes += minutesToAllocate;
    state.remainingTaskMinutes -= minutesToAllocate;

    if (state.remainingTaskMinutes === 0) {
      state.taskIndex++;
      state.remainingTaskMinutes =
        state.tasks[state.taskIndex]?.estimatedMinutes ?? 0;
    }
  }

  return assignments;
}

function buildWeekSchedule(params: {
  inputs: ScheduleInputs;
  weekNumber: number;
  state: AllocationState;
  sessionMinutes: number;
}): Week {
  const { startDate, endDate } = getWeekBoundaries(
    params.inputs.startDate,
    params.weekNumber,
  );

  const days = SESSION_DAYS_OFFSET.map((dayOffset, sessionIdx): Day => {
    return {
      dayNumber: sessionIdx + 1,
      date: addDaysToDate(startDate, dayOffset),
      sessions: allocateSessionTasks(params.state, params.sessionMinutes),
    };
  });

  return {
    weekNumber: params.weekNumber,
    startDate,
    endDate,
    days,
  };
}

/**
 * Allocate tasks into a week-by-week schedule with three sessions per week (Mon/Wed/Fri).
 *
 * @param inputs - Schedule input object containing at least `startDate`, `weeklyHours`, and `tasks`; tasks are distributed in order and may be split across sessions.
 * @returns The generated schedule object containing `weeks` (each with start/end dates and three session days), `totalWeeks`, and `totalSessions`.
 * @throws Error if `weeklyHours` is less than or equal to 0.
 * @throws Error if `tasks` is not an array.
 * @throws Error if any task has a negative `estimatedMinutes`.
 */
export function distributeTasksToSessions(
  inputs: ScheduleInputs,
): ScheduleJson {
  validateScheduleInputs(inputs);

  const totalMinutes = inputs.tasks.reduce(
    (sum, t) => sum + t.estimatedMinutes,
    0,
  );

  if (totalMinutes === 0) {
    return {
      weeks: [],
      totalWeeks: 0,
      totalSessions: 0,
    };
  }

  const minutesPerWeek = inputs.weeklyHours * 60;
  const totalWeeks = Math.ceil(totalMinutes / minutesPerWeek);

  // Sort by order for deterministic distribution; drop zero-minute tasks (no session capacity used).
  const sortedTasks = getPositiveTasksInOrder(inputs.tasks);

  const weeks: Week[] = [];
  const sessionMinutes = minutesPerWeek / DEFAULT_SESSIONS_PER_WEEK;
  const allocationState: AllocationState = {
    tasks: sortedTasks,
    taskIndex: 0,
    remainingTaskMinutes: sortedTasks[0]?.estimatedMinutes ?? 0,
  };

  for (let weekNum = 1; weekNum <= totalWeeks; weekNum++) {
    weeks.push(
      buildWeekSchedule({
        inputs,
        weekNumber: weekNum,
        state: allocationState,
        sessionMinutes,
      }),
    );
  }

  return {
    weeks,
    totalWeeks,
    totalSessions: weeks.reduce((sum, w) => sum + w.days.length, 0),
  };
}
