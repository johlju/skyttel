/** Whole-message conversation commands. Quoted, negated and hypothetical
 * mentions remain ordinary conversation and never grant destructive authority. */
export function conversationCommand(text: string) {
  const parts = text
    .trim()
    .toLocaleLowerCase('sv')
    .replace(/[.!]+$/u, '')
    .split(/\s*(?:[,;]|\boch\b)\s*/u);
  if (parts.some((part) => !['nytt samtal', 'kasta utkastet'].includes(part))) return null;
  return { reset: parts.includes('nytt samtal'), discard: parts.includes('kasta utkastet') };
}
