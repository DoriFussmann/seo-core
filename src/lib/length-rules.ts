/**
 * Character-length rules for titles and descriptions. One source for the
 * content schemas, the audit, and tools that check content before a build.
 * Lengths are JavaScript string lengths.
 */

export interface LengthRule {
  /** Inclusive minimum; absent = no minimum. */
  readonly min?: number;
  /** Inclusive maximum. */
  readonly max: number;
}

export const LENGTH_RULES = {
  /** Article frontmatter `title` (also the page <title>). */
  articleTitle: { min: 55, max: 60 },
  /** Article frontmatter `description` (also the meta description). */
  articleDescription: { min: 140, max: 160 },
  /** Service frontmatter `description`. */
  serviceDescription: { min: 140, max: 160 },
  /** <title> of a non-article page. */
  pageTitle: { min: 50, max: 60 },
  /** <title> of a legal page (see LEGAL_PAGE_PATHS): short titles are fine. */
  legalPageTitle: { max: 60 },
  /** Meta description of a non-article page. */
  pageDescription: { min: 140, max: 160 },
} as const satisfies Record<string, LengthRule>;

/** dist-relative pages that use `legalPageTitle`. */
export const LEGAL_PAGE_PATHS: readonly string[] = ["privacy/index.html", "terms/index.html"];

/** "50–60" or "max 60". */
export function describeLengthRule(rule: LengthRule): string {
  return rule.min === undefined ? `max ${rule.max}` : `${rule.min}–${rule.max}`;
}

/** True when `value` fits the rule. */
export function fitsLengthRule(value: string, rule: LengthRule): boolean {
  const n = value.length;
  return (rule.min === undefined || n >= rule.min) && n <= rule.max;
}
