/**
 * Article H1 resolution.
 *
 * The <title> tag and the on-page <h1> serve different readers: the title is
 * written for the SERP (55–60 chars, keyword + hook), the H1 for someone already
 * on the page. When both render the same string, crawlers (Semrush, Ahrefs,
 * Screaming Frog) flag every article as "duplicate H1 and title".
 *
 * Resolution order, applied to every article at schema-parse time so every
 * layout (shared or site-owned) receives a resolved `data.h1`:
 *
 *   1. An explicit frontmatter `h1` that differs from the title wins.
 *   2. Otherwise derive one from the title: drop a trailing parenthetical
 *      ("(2026)", "(And What to Do With It)") and keep the headline before the
 *      first subtitle separator (":", "?", " — ", " – ", " | ", " - ").
 *      "How to Find Investors for Your Startup: The Complete Guide"
 *        → "How to Find Investors for Your Startup"
 *      If that headline is too short, the title minus its parenthetical is used
 *      when it differs ("Pre-Seed Funding: The Complete Guide for Founders").
 *   3. If no distinct headline of at least H1_MIN_LENGTH chars can be derived,
 *      fall back to the title. The audit reports these so the CMS can supply
 *      an explicit `h1`.
 */

export const H1_MIN_LENGTH = 20;

export function normalizeHeading(text: string): string {
  return String(text ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;|&#x27;/g, "'")
    .replace(/&quot;|&#34;/g, '"')
    .replace(/&[a-z0-9#]+;/gi, " ")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function sameHeading(a: string | undefined | null, b: string | undefined | null): boolean {
  return normalizeHeading(a ?? "") === normalizeHeading(b ?? "");
}

const TRAILING_PARENTHETICAL = /\s*\([^()]*\)\s*$/;
// ": " and "? " end the headline; dashes/pipes must be space-delimited so
// hyphenated words ("Pre-Seed", "Step-by-Step") are never split.
const SUBTITLE_SPLIT = /(\?)\s+|:\s+|\s+[—–|]\s+|\s+-\s+/;

/** Headline derived from a title, or null when none is distinct and long enough. */
export function deriveH1(title: string): string | null {
  const original = String(title ?? "").trim();
  if (!original) return null;

  const tidy = (value: string) => value.replace(/[\s,;:—–|-]+$/, "").trim();
  const usable = (value: string) => value.length >= H1_MIN_LENGTH && !sameHeading(value, original);

  const unwrapped = tidy(original.replace(TRAILING_PARENTHETICAL, ""));
  const match = SUBTITLE_SPLIT.exec(unwrapped);
  if (match && match.index > 0) {
    const headline = tidy(unwrapped.slice(0, match.index) + (match[1] ?? ""));
    if (usable(headline)) return headline;
  }
  // No usable headline: the title minus its trailing parenthetical still differs.
  return usable(unwrapped) ? unwrapped : null;
}

export interface H1Source {
  title: string;
  h1?: string | null;
}

/** The H1 to render for an article. Never empty; equals the title only as a last resort. */
export function resolveH1(data: H1Source): string {
  const title = String(data.title ?? "").trim();
  const explicit = String(data.h1 ?? "").trim();
  if (explicit && !sameHeading(explicit, title)) return explicit;
  return deriveH1(title) ?? title;
}
