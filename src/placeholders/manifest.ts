/**
 * Placeholder manifest: a declarative list of what a site built from a
 * template still has to replace, and how to tell whether it has been.
 *
 * It is plain data (no functions, no RegExp objects) so the same list can be
 * stored as JSON and read by tools that do not run TypeScript — TNV reads
 * `src/placeholders/blueprint.json` from GitHub at the site's pinned tag.
 * A test keeps that JSON equal to BLUEPRINT_PLACEHOLDERS.
 *
 * All paths are relative to the site root (the folder whose package.json pins
 * seo-core — `site/` in the SEO Blueprint). Globs support `*`, `**` and `?`.
 */

import { BLUEPRINT_GUIDES } from "./guides";

/** "required" blocks completion; "suggested" is shown but never blocks. */
export type PlaceholderLevel = "required" | "suggested";

interface CheckBase {
  /** Stable key. Tools store sign-offs against it, so never rename one. */
  id: string;
  label: string;
  group: string;
  /** Default "required". */
  level?: PlaceholderLevel;
  /**
   * When true, the check passing only means the template text is gone. A
   * person still has to confirm the new content (legal pages, testimonials):
   * the result is "review" instead of "replaced".
   */
  review?: boolean;
  /** One line: what is still wrong. */
  help?: string;
  /** Numbered actions to fix it, in order, for a non-developer. */
  steps?: string[];
  /** Text to paste into Claude Chat or Cursor; [square brackets] are filled in by the user. */
  prompt?: string;
}

/** Any marker string found in a matching file → placeholder. */
export interface MarkersCheck extends CheckBase {
  kind: "markers";
  files: string | string[];
  /** Case-sensitive substrings. */
  markers: string[];
  exclude?: string[];
  /** Result when no file matches. Default "unknown" (the file was expected). */
  missing?: "replaced" | "unknown";
}

/**
 * Each pattern is a RegExp source (multiline) with one capture group. A
 * captured value (trimmed) listed in `placeholders` → placeholder. No pattern
 * matching at all → unknown (the setting moved or was renamed).
 */
export interface ValueCheck extends CheckBase {
  kind: "value";
  file: string;
  patterns: string[];
  placeholders: string[];
}

/** Any matching file exists → placeholder (template files to rename or delete). */
export interface ExistsCheck extends CheckBase {
  kind: "exists";
  files: string | string[];
}

/**
 * Files under `dirs` whose SHA-256 equals one of the template's originals →
 * placeholder. `hashes` is a JSON file of { "<template path>": "<sha256 hex>" }.
 * SVG line endings are normalized to LF before hashing.
 */
export interface OriginalsCheck extends CheckBase {
  kind: "originals";
  hashes: string;
  dirs: string[];
}

/** YAML `image:` briefs with no sibling `src:` (the page shows "Image placeholder"). */
export interface ImageBriefsCheck extends CheckBase {
  kind: "imageBriefs";
  files: string | string[];
}

export type PlaceholderCheck = MarkersCheck | ValueCheck | ExistsCheck | OriginalsCheck | ImageBriefsCheck;

export interface PlaceholderManifest {
  version: 1;
  /** Which template the list describes. */
  template: string;
  checks: PlaceholderCheck[];
}

const PAGES = "src/content/pages/*.yaml";

/** Detection rules only; the how-to text comes from guides.ts. */
const BLUEPRINT_CHECKS: PlaceholderCheck[] = [
  {
    id: "site-url",
    label: "Site URL",
    group: "Site config",
    kind: "value",
    file: "src/config/site.ts",
    patterns: ['^export const SITE_URL\\s*=\\s*"([^"]*)"'],
    placeholders: ["https://example.com", ""],
  },
  {
    id: "site-name",
    label: "Site name",
    group: "Site config",
    kind: "value",
    file: "src/config/site.ts",
    patterns: ['^export const SITE_NAME\\s*=\\s*"([^"]*)"'],
    placeholders: ["Site Name", ""],
  },
  {
    id: "site-tagline",
    label: "Tagline",
    group: "Site config",
    kind: "value",
    file: "src/config/site.ts",
    patterns: ['^export const SITE_TAGLINE\\s*=\\s*"([^"]*)"'],
    placeholders: ["Primary positioning phrase", ""],
  },
  {
    id: "same-as",
    label: "Brand profiles (sameAs)",
    group: "Site config",
    kind: "value",
    file: "src/config/site.ts",
    patterns: ["^export const SAME_AS\\b[^=]*=\\s*\\[([\\s\\S]*?)\\]"],
    placeholders: [""],
  },
  {
    id: "ga4-id",
    label: "Google Analytics ID",
    group: "Site config",
    level: "suggested",
    kind: "value",
    file: "src/config/site.ts",
    patterns: ['^export const GA4_MEASUREMENT_ID\\s*=\\s*"([^"]*)"'],
    placeholders: [""],
  },
  {
    id: "articles-description",
    label: "Articles index description",
    group: "Site config",
    level: "suggested",
    kind: "value",
    file: "src/config/site.ts",
    patterns: ['^export const ARTICLES_DESCRIPTION\\s*=\\s*"([^"]*)"'],
    placeholders: [
      "Browse every published article: practical guides on technical SEO, content strategy and the operating systems behind them, kept current and reviewed.",
    ],
  },
  {
    id: "team-description",
    label: "Team index description",
    group: "Site config",
    level: "suggested",
    kind: "value",
    file: "src/config/site.ts",
    patterns: ['^export const TEAM_DESCRIPTION\\s*=\\s*"([^"]*)"'],
    placeholders: [
      "Meet the people behind this site: the operators and editors who write, review and maintain every guide, and the experience each one brings to the work.",
    ],
  },
  {
    id: "wordmark",
    label: "Wordmark",
    group: "Design",
    kind: "value",
    file: "Design Guide.md",
    patterns: ['"wordmarkPrimary"\\s*:\\s*"([^"]*)"', '"wordmarkAccent"\\s*:\\s*"([^"]*)"'],
    placeholders: ["Site", "Name"],
  },
  {
    id: "template-images",
    label: "Logo, favicon, social image and demo images",
    group: "Images",
    kind: "originals",
    hashes: "scripts/template-originals.json",
    dirs: ["public", "src/assets"],
  },
  {
    id: "image-briefs",
    label: "Page images",
    group: "Images",
    kind: "imageBriefs",
    files: PAGES,
  },
  {
    id: "page-copy",
    label: "Page copy",
    group: "Pages",
    kind: "markers",
    files: PAGES,
    exclude: ["src/content/pages/privacy.yaml", "src/content/pages/terms.yaml", "src/content/pages/testimonials.yaml"],
    markers: ["[PLACEHOLDER", "[GAP:", "Placeholder", "Site Name", "example.com", "Role to be confirmed"],
  },
  {
    id: "home-template-sections",
    label: "Homepage template sections",
    group: "Pages",
    kind: "markers",
    files: "src/content/pages/home.yaml",
    markers: [
      "What this template holds",
      "Page templates in this seed",
      "Section types in the library",
      "Notes for the next edit",
      "Section sample",
    ],
    missing: "replaced",
  },
  {
    id: "privacy",
    label: "Privacy policy",
    group: "Legal",
    review: true,
    kind: "markers",
    files: "src/content/pages/privacy.yaml",
    markers: ["[PLACEHOLDER", "placeholder", "Placeholder"],
  },
  {
    id: "terms",
    label: "Terms of use",
    group: "Legal",
    review: true,
    kind: "markers",
    files: "src/content/pages/terms.yaml",
    markers: ["[PLACEHOLDER", "placeholder", "Placeholder"],
  },
  {
    id: "testimonials",
    label: "Testimonials",
    group: "Legal",
    review: true,
    kind: "markers",
    files: ["src/content/pages/testimonials.yaml", "src/content/pages/home.yaml"],
    markers: ["[PLACEHOLDER", "Placeholder quote", "placeholder quote", "Placeholder name", "Role to be confirmed"],
    missing: "replaced",
  },
  {
    id: "author",
    label: "Author profile",
    group: "Collections",
    kind: "markers",
    files: "src/content/team/*.md",
    markers: ["[PLACEHOLDER"],
  },
  {
    id: "author-slug",
    label: "Author file name",
    group: "Collections",
    level: "suggested",
    kind: "exists",
    files: "src/content/team/site-author.md",
  },
  {
    id: "services",
    label: "Services",
    group: "Collections",
    kind: "markers",
    files: "src/content/services/*.md",
    markers: ["placeholder service", "Replace this page at Site Activation"],
    missing: "replaced",
  },
  {
    id: "demo-articles",
    label: "Demo articles",
    group: "Collections",
    kind: "exists",
    files: [
      "src/content/articles/content-strategy-foundations.md",
      "src/content/articles/core-web-vitals-complete-guide.md",
      "src/content/articles/improve-core-web-vitals-howto.md",
      "src/content/articles/technical-seo-foundations.md",
    ],
  },
];

/** What a site made from the SEO Blueprint template has to replace before launch. */
export const BLUEPRINT_PLACEHOLDERS: PlaceholderManifest = {
  version: 1,
  template: "blueprint-seo-template",
  checks: BLUEPRINT_CHECKS.map((check) => ({ ...check, ...BLUEPRINT_GUIDES[check.id] })),
};
