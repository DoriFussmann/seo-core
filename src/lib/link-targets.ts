/**
 * Article links open in a new tab.
 *
 * Every <a href> in an article body — internal or external — gets
 * target="_blank" rel="noopener", so the reader's article stays open.
 * Skipped: in-page anchors (#…), mailto:, tel:, javascript:, and links that
 * already set a target. Applied by ArticleBody at render time, so it covers
 * content from every writer (TNV publish, link wiring, manual edits).
 */

const A_OPEN_RE = /<a\b([^>]*)>/gi;
const HREF_RE = /\shref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i;
const SKIP_HREF_RE = /^\s*(#|mailto:|tel:|javascript:)/i;
const REL_RE = /\srel\s*=\s*(?:"([^"]*)"|'([^']*)')/i;

export function openLinksInNewTab(html: string): string {
  return String(html ?? "").replace(A_OPEN_RE, (match, attrs: string) => {
    const href = attrs.match(HREF_RE);
    if (!href) return match;
    const url = href[1] ?? href[2] ?? href[3] ?? "";
    if (!url || SKIP_HREF_RE.test(url)) return match;
    if (/\starget\s*=/i.test(attrs)) return match;
    let next = `${attrs} target="_blank"`;
    const rel = attrs.match(REL_RE);
    if (rel) {
      const tokens = new Set((rel[1] ?? rel[2] ?? "").split(/\s+/).filter(Boolean));
      tokens.add("noopener");
      next = next.replace(REL_RE, ` rel="${[...tokens].join(" ")}"`);
    } else {
      next += ` rel="noopener"`;
    }
    return `<a${next}>`;
  });
}
