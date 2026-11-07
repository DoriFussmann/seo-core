/**
 * Distinct topic names in first-seen order, compared case- and
 * whitespace-insensitively. Used for Article `about`, where the pillar keyword
 * and the tags often repeat the same phrase.
 */
export function uniqueTopics(names: ReadonlyArray<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of names) {
    const name = String(raw ?? "").replace(/\s+/g, " ").trim();
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}
