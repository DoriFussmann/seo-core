/** True when the last path segment looks like a file ("robots.txt", "a.webp", "index.md"). */
function isFilePath(pathname: string): boolean {
  const last = pathname.split("/").filter(Boolean).pop() ?? "";
  return /\.[a-z0-9]+$/i.test(last);
}

function splitSuffix(path: string): { pathname: string; suffix: string } {
  const index = path.search(/[?#]/);
  if (index === -1) return { pathname: path, suffix: "" };
  return { pathname: path.slice(0, index), suffix: path.slice(index) };
}

function withTrailingSlash(pathname: string): string {
  if (isFilePath(pathname)) return pathname;
  return pathname.endsWith("/") ? pathname : `${pathname}/`;
}

/**
 * Absolute URL on the site. Page paths get a trailing slash (trailingSlash:
 * "always"); file paths (anything ending in an extension) are left as-is.
 * Query strings and fragments are preserved.
 */
export function abs(path: string, siteUrl: string): string {
  const origin = siteUrl.replace(/\/+$/, "");
  if (/^https?:\/\//i.test(path)) {
    try {
      const url = new URL(path);
      return `${url.origin}${withTrailingSlash(url.pathname)}${url.search}${url.hash}`;
    } catch {
      return path;
    }
  }
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const { pathname, suffix } = splitSuffix(normalized);
  return `${origin}${withTrailingSlash(pathname)}${suffix}`;
}
