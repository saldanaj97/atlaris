export function sanitizeUserInput(value: string, maxChars: number): string {
  const collapsed = value
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/---+/g, '—');
  return collapsed.slice(0, maxChars).trim();
}
