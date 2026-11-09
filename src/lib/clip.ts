/**
 * Shortens text to at most `max` characters without cutting a sentence.
 *
 * Whitespace is collapsed first. Text that already fits comes back whole.
 * Otherwise it keeps as many complete sentences as fit. When even the first
 * sentence is longer than `max`, it cuts at the last word boundary and adds
 * an ellipsis, so the result never ends mid-word.
 */
export function clipToSentence(text: string, max: number): string {
  const flat = String(text ?? "").replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;

  const sentences = flat.match(/[^.!?]+[.!?]+(?:["'”’)\]]+)?(?=\s|$)|[^.!?]+$/g) ?? [flat];
  let out = "";
  for (const sentence of sentences) {
    const next = `${out} ${sentence.trim()}`.trim();
    if (next.length > max) break;
    out = next;
  }
  if (out) return out;

  const cut = flat.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > 0 ? cut.slice(0, space) : cut).replace(/[\s,;:–—-]+$/, "")}…`;
}
