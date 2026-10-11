/**
 * Article body heading guard.
 *
 * ArticleLayout owns the page's single <h1> (the article title). Markdown bodies
 * must never add another one — the audit fails the deploy if they do. Content
 * reaches sites from several writers (TNV publish, link wiring, rewrites, manual
 * edits), so the invariant is enforced here, at render time, not trusted upstream.
 *
 *  - A body <h1> whose text matches the article title or the rendered H1 is
 *    removed (it would only duplicate the layout's heading).
 *  - Any other body <h1> is demoted to <h2>.
 */

import { normalizeHeading as normalize } from "./h1";

const H1_RE = /<h1\b([^>]*)>([\s\S]*?)<\/h1\s*>/gi;

export function guardBodyH1(html: string, title?: string, h1?: string): string {
  const wanted = new Set([title, h1].filter(Boolean).map((t) => normalize(t!)));
  return String(html ?? "").replace(H1_RE, (_match, attrs: string, inner: string) => {
    if (wanted.has(normalize(inner))) return "";
    return `<h2${attrs}>${inner}</h2>`;
  });
}
