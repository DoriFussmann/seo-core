import type { CheerioAPI } from "cheerio";

/** "/about" → "/about/"; query and fragment dropped. */
export function normalizePathname(path: string): string {
  const trimmed = path.trim().split(/[?#]/)[0];
  const leading = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return leading.endsWith("/") ? leading : `${leading}/`;
}

/** True for the built 404 page ("404.html", "404/index.html"). */
export function isNotFoundPage(rel: string): boolean {
  return /(^|\/)404(\/index)?\.html$/.test(rel);
}

/**
 * The page's canonical URL when the page should be indexed: not a redirect
 * stub, no `noindex`, and canonical to itself on the site's origin. Null otherwise.
 */
export function indexableCanonical($: CheerioAPI, pathname: string, origin: string): URL | null {
  if ($('meta[http-equiv="refresh" i]').length) return null;
  const robots = ($('meta[name="robots"]').attr("content") || "").toLowerCase();
  if (/\bnoindex\b/.test(robots)) return null;

  const canonical = $('link[rel="canonical"]').attr("href");
  if (!canonical) return null;
  let url: URL;
  try {
    url = new URL(canonical);
  } catch {
    return null;
  }
  if (url.origin !== origin || normalizePathname(url.pathname) !== pathname) return null;
  return url;
}
