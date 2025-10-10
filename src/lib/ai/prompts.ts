export interface PromptParams {
  topic: string;
  skillLevel: 'beginner' | 'intermediate' | 'advanced';
  learningStyle: 'reading' | 'video' | 'practice' | 'mixed';
  weeklyHours: number;
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
    'Do NOT include markdown, code fences, or commentary. JSON only.',
  ].join('\n');
}

export function buildUserPrompt(p: PromptParams): string {
  return [
    `Topic: ${p.topic}`,
    `Skill level: ${p.skillLevel}`,
    `Learning style: ${p.learningStyle}`,
    `Weekly hours: ${p.weeklyHours}`,
    'Generate a learning plan as JSON that adheres to the schema and constraints.',
  ].join('\n');
}

