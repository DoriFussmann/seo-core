const NO_SLASH = /(?:robots\.txt|rss\.xml|llms\.txt|sitemap-index\.xml|\.md)$/;

export function abs(path: string, siteUrl: string): string {
  const origin = siteUrl.replace(/\/+$/, "");
  if (/^https?:\/\//i.test(path)) {
    try {
      const url = new URL(path);
      if (NO_SLASH.test(url.pathname)) return `${url.origin}${url.pathname}`;
      const pathname = url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`;
      return `${url.origin}${pathname}`;
    } catch {
      return path;
    }
  }
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (NO_SLASH.test(normalized)) return `${origin}${normalized}`;
  const withSlash = normalized.endsWith("/") ? normalized : `${normalized}/`;
  return `${origin}${withSlash}`;
}
