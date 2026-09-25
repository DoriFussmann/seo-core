/**
 * Article body heading guard.
 *
 * ArticleLayout owns the page's single <h1> (the article title). Markdown bodies
 * must never add another one — the audit fails the deploy if they do. Content
 * reaches sites from several writers (TNV publish, link wiring, rewrites, manual
 * edits), so the invariant is enforced here, at render time, not trusted upstream.
 *
 *  - A body <h1> whose text matches the article title is removed (it would only
 *    duplicate the layout's title).
 *  - Any other body <h1> is demoted to <h2>.
 */

function normalize(text: string): string {
  return text
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;|&#x27;/g, "'")
    .replace(/&quot;|&#34;/g, '"')
    .replace(/&[a-z0-9#]+;/gi, " ")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const H1_RE = /<h1\b([^>]*)>([\s\S]*?)<\/h1\s*>/gi;

export function guardBodyH1(html: string, title?: string): string {
  const wanted = title ? normalize(title) : "";
  return String(html ?? "").replace(H1_RE, (_match, attrs: string, inner: string) => {
    if (wanted && normalize(inner) === wanted) return "";
    return `<h2${attrs}>${inner}</h2>`;
  });
}
