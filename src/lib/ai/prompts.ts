export interface PromptParams {
  topic: string;
  skillLevel: 'beginner' | 'intermediate' | 'advanced';
  learningStyle: 'reading' | 'video' | 'practice' | 'mixed';
  weeklyHours: number;
  startDate?: string | null;
  deadlineDate?: string | null;
}

export function buildSystemPrompt(): string {
  return [
    'You are an expert curriculum designer. Output strictly JSON only.',
    'Return an object: {"modules": Array<Module>}. No extra text.',
    'Module: { title: string, description?: string, estimated_minutes: int>=0, tasks: Task[] }',
    'Task: { title: string, description?: string, estimated_minutes: int>=0 }',
    'Constraints:',
    '- Provide 3-6 modules total.',
    '- Each module must include 3-6 tasks.',
    '- Use concise, action-oriented titles.',
    '- estimated_minutes must be integers and non-negative.',
    '- If start and deadline dates are provided, distribute learning to fit within the timeline.',
    'Do NOT include markdown, code fences, or commentary. JSON only.',
  ].join('\n');
}

export function buildUserPrompt(p: PromptParams): string {
  const lines = [
    `Topic: ${p.topic}`,
    `Skill level: ${p.skillLevel}`,
    `Learning style: ${p.learningStyle}`,
    `Weekly hours: ${p.weeklyHours}`,
  ];

  if (p.startDate) {
    lines.push(`Start date: ${p.startDate}`);
  }

  if (p.deadlineDate) {
    lines.push(`Deadline: ${p.deadlineDate}`);
  }

  lines.push(
    'Generate a learning plan as JSON that adheres to the schema and constraints.'
  );

  return lines.join('\n');
}

/**
 * Micro-explanation prompt builders
 */
export interface MicroExplanationPromptParams {
  topic: string;
  moduleTitle?: string;
  taskTitle: string;
  skillLevel: 'beginner' | 'intermediate' | 'advanced';
}

export function buildMicroExplanationSystemPrompt(): string {
  return [
    'You are an expert educator who creates concise, helpful learning explanations.',
    'Generate micro-explanations that help learners understand concepts quickly.',
    'Output must be valid JSON with the following structure:',
    '{',
    '  "explanation": "2-3 sentences explaining the task concept",',
    '  "practice": "Optional short practice exercise or question"',
    '}',
    'Guidelines:',
    '- Keep explanations concise (2-3 sentences max)',
    '- Use clear, accessible language appropriate for the skill level',
    '- Provide markdown-safe text',
    '- Include a practical exercise when relevant',
    '- Focus on actionable insights',
  ].join('\n');
}

export function buildMicroExplanationUserPrompt(
  p: MicroExplanationPromptParams
): string {
  const lines = [
    `Generate a micro-explanation for this learning task:`,
    ``,
    `Topic: ${p.topic}`,
    `Task: ${p.taskTitle}`,
    `Skill Level: ${p.skillLevel}`,
  ];

  if (p.moduleTitle) {
    lines.push(`Module: ${p.moduleTitle}`);
  }

  lines.push(
    '',
    'Provide:',
    '1. A 2-3 sentence explanation of what this task covers and why it matters',
    '2. An optional practice exercise that reinforces the concept',
    '',
    'Return JSON only, no additional text or markdown.'
  );

  return lines.join('\n');
}
