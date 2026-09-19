/** Calendar-day form stored after schema coercion. */
export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Normalize a YAML Date, YYYY-MM-DD string, or datetime string to YYYY-MM-DD.
 * Returns undefined when the value cannot be read as a calendar day.
 */
export function toIsoDateString(value: unknown): string | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  const match = /^(\d{4}-\d{2}-\d{2})(?:T[\d:.+-Z]*)?$/.exec(trimmed);
  if (!match) return undefined;
  if (trimmed.includes("T")) {
    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) return undefined;
    return parsed.toISOString().slice(0, 10);
  }
  return match[1];
}
