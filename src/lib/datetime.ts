import { ISO_DATE } from "./isoDate";

/** Time zone used for article timestamps when a site does not set one. */
export const DEFAULT_TIME_ZONE = "America/Los_Angeles";

/** UTC offset of `timeZone` at `instant`, in minutes (Los Angeles in summer: -420). */
function offsetMinutes(instant: number, timeZone: string): number {
  const name =
    new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
      .formatToParts(new Date(instant))
      .find((part) => part.type === "timeZoneName")?.value ?? "GMT";
  const match = /^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/.exec(name);
  if (!match) return 0; // "GMT": UTC itself
  const minutes = Number(match[2]) * 60 + Number(match[3] ?? 0);
  return match[1] === "-" ? -minutes : minutes;
}

function formatOffset(minutes: number): string {
  const sign = minutes < 0 ? "-" : "+";
  const abs = Math.abs(minutes);
  const hours = String(Math.floor(abs / 60)).padStart(2, "0");
  const mins = String(abs % 60).padStart(2, "0");
  return `${sign}${hours}:${mins}`;
}

/**
 * Calendar day → ISO 8601 date-time at local midnight in `timeZone`, with its
 * UTC offset ("2026-08-03" → "2026-08-03T00:00:00-07:00"). Daylight saving is
 * taken from the date itself. Values that already carry a time pass through.
 * Throws on an unknown time zone or a malformed date, so a bad config fails
 * the build instead of shipping wrong timestamps.
 */
export function zonedDateTime(date: string, timeZone: string = DEFAULT_TIME_ZONE): string {
  const value = date.trim();
  if (value.includes("T")) return value;
  if (!ISO_DATE.test(value)) throw new Error(`zonedDateTime: expected YYYY-MM-DD, got "${date}"`);
  const [year, month, day] = value.split("-").map(Number);
  const utcMidnight = Date.UTC(year, month - 1, day);
  // The offset at local midnight: first guess from UTC midnight, then re-read
  // at the corrected instant in case a DST change falls in between.
  const guess = offsetMinutes(utcMidnight, timeZone);
  const offset = offsetMinutes(utcMidnight - guess * 60_000, timeZone);
  return `${value}T00:00:00${formatOffset(offset)}`;
}
