import type { TextAssistantChange } from './text-assistant.js';

/** Statements about checked changes, grouped without repeating a subject. */
export function assistantChangeSummary(changes: TextAssistantChange[]) {
  const grouped = new Map<string, Set<string>>();
  for (const { subject, action } of changes) {
    const subjects = grouped.get(action) ?? new Set<string>();
    subjects.add(subject);
    grouped.set(action, subjects);
  }
  return [...grouped].map(
    ([action, subjects]) => `${new Intl.ListFormat('sv').format([...subjects])} ${action}.`,
  );
}
