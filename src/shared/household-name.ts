export const householdNameMaxLength = 100;

export function normalizeHouseholdName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.trim();
  if (!name || name.length > householdNameMaxLength || /\p{Cc}/u.test(name)) return null;
  return name;
}
