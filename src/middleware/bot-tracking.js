/**
 * AI-crawler tracking and SEO response headers for Vercel Routing Middleware.
 *
 * Reports known crawler hits (ChatGPT, Claude, Perplexity, Google, Bing, …) to
 * an analytics endpoint after the response is sent. Human visitors are never
 * touched, and nothing happens until the token env var is set.
 *
 * PLAIN JAVASCRIPT ON PURPOSE. Vercel runs Routing Middleware on Node.js and
 * does not transpile node_modules, and Node refuses to load .ts files from
 * node_modules (ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING). v1.4.0 shipped
 * this as .ts and every request returned 500 MIDDLEWARE_INVOCATION_FAILED.
 * Keep this file .js, with explicit ".js" import extensions; types live in
 * index.d.ts. test/links-and-bots.test.ts loads it under plain Node to
 * enforce this.
 *
 * Site usage — `middleware.js` next to the site's package.json:
 *
 *   import { createBotMiddleware } from "seo-core/middleware";
 *   export const config = { matcher: ["/((?!_astro/|_vercel/|favicon).*)"] };
 *   export default createBotMiddleware({
 *     endpoint: "https://thenightventures.com/api/audit-snapshot?action=analytics.ingest",
 *   });
 *
 * `config` stays in the site file: Vercel reads the matcher statically.
 *
 * Since 1.6.0 the same middleware also sets canonical / noindex headers on
 * machine-readable copies (see machineCopyHeaders) on every site, and can
 * 308 URLs to their trailing-slash form when the site opts in:
 *
 *   createBotMiddleware({ endpoint, trailingSlash: { exclude: ["/api", "/portal"] } })
 *
 * Since 1.7.0 it also adds baseline security headers to every response it
 * sees (see SECURITY_HEADERS). Turn them off with `securityHeaders: false`,
 * skip proxied apps with `securityHeaders: { exclude: ["/portal"] }`, and add
 * a site-specific Content-Security-Policy with `contentSecurityPolicy` (or
 * `contentSecurityPolicyReportOnly` while testing it).
 */

/** Lowercase user-agent tokens. Keep in step with TNV's BOT_SIGNATURES. */
export const CRAWLER_UA_TOKENS = Object.freeze([
  "oai-searchbot",
  "chatgpt-user",
  "gptbot",
  "claude-searchbot",
  "claude-user",
  "claudebot",
  "anthropic-ai",
  "perplexity-user",
  "perplexitybot",
  "mistralai-user",
  "duckassistbot",
  "meta-externalfetcher",
  "meta-externalagent",
  "bytespider",
  "ccbot",
  "amazonbot",
  "cohere-ai",
  "youbot",
  "applebot",
  "googlebot",
  "bingbot",
]);

export function isCrawler(userAgent) {
  const ua = String(userAgent ?? "").toLowerCase();
  return ua.length > 0 && CRAWLER_UA_TOKENS.some((token) => ua.includes(token));
}

function readEnv(name) {
  try {
    return globalThis.process?.env?.[name];
  } catch {
    return undefined;
  }
}

/**
 * Response headers for machine-readable copies of pages (seo-core >= 1.6.0).
 *
 * - `/…/index.md` (the article markdown endpoint) gets
 *   `Link: <…/>; rel="canonical"` pointing at its HTML page, so Google folds
 *   the copy into the article instead of indexing a duplicate.
 * - `/llms.txt` and `/llms-full.txt` get `X-Robots-Tag: noindex`: AI crawlers
 *   still fetch them, they just stay out of search results.
 *
 * Returns a header map, or null when the path needs none.
 */
export function machineCopyHeaders(pathname, origin) {
  if (typeof pathname !== "string") return null;
  if (pathname.endsWith("/index.md")) {
    const page = pathname.slice(0, -"index.md".length);
    return { Link: `<${origin}${page}>; rel="canonical"` };
  }
  if (pathname === "/llms.txt" || pathname === "/llms-full.txt") {
    return { "X-Robots-Tag": "noindex" };
  }
  return null;
}

/**
 * Baseline security headers (seo-core >= 1.7.0). Safe for any static
 * marketing site: none restricts scripts, styles or third-party embeds the
 * page itself loads. Framing is limited to the site's own origin. HSTS is left
 * to the host (Vercel sets it).
 */
export const SECURITY_HEADERS = Object.freeze({
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "SAMEORIGIN",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), browsing-topics=()",
});

/**
 * Security headers for a path, or null when turned off or excluded.
 * `options` is the middleware's `securityHeaders` value (default true).
 */
export function securityHeaders(pathname, options = true) {
  if (options === false) return null;
  const opts = options && typeof options === "object" ? options : {};
  const exclude = Array.isArray(opts.exclude) ? opts.exclude : [];
  if (typeof pathname === "string" && excluded(pathname, exclude)) return null;
  const headers = { ...SECURITY_HEADERS };
  if (typeof opts.contentSecurityPolicy === "string" && opts.contentSecurityPolicy.trim()) {
    headers["Content-Security-Policy"] = opts.contentSecurityPolicy.trim();
  }
  if (typeof opts.contentSecurityPolicyReportOnly === "string" && opts.contentSecurityPolicyReportOnly.trim()) {
    headers["Content-Security-Policy-Report-Only"] = opts.contentSecurityPolicyReportOnly.trim();
  }
  return headers;
}

function excluded(pathname, prefixes) {
  return prefixes.some((prefix) => {
    const p = String(prefix).replace(/\/+$/, "");
    return p !== "" && (pathname === p || pathname.startsWith(`${p}/`));
  });
}

/**
 * Where a page URL should 308 to, or null (seo-core >= 1.6.0, opt-in).
 *
 * - `/about`        -> `/about/`   (no extension, no trailing slash)
 * - `/index.html`   -> `/`, `/x/index.html` -> `/x/`
 *
 * Paths with a file extension, and paths under an `exclude` prefix (proxied
 * apps such as `/api`, `/portal`), are left alone. GET and HEAD only.
 */
export function trailingSlashTarget(method, pathname, exclude = []) {
  if (method !== "GET" && method !== "HEAD") return null;
  if (typeof pathname !== "string" || pathname === "/") return null;
  if (excluded(pathname, exclude)) return null;
  if (pathname.endsWith("/index.html")) return pathname.slice(0, -"index.html".length);
  if (pathname.endsWith("/")) return null;
  const last = pathname.slice(pathname.lastIndexOf("/") + 1);
  if (last.includes(".")) return null;
  return `${pathname}/`;
}

/** Vercel Routing Middleware: continue to the origin, adding response headers. */
function continueWith(headers) {
  return new Response(null, { headers: { ...headers, "x-middleware-next": "1" } });
}

export function createBotMiddleware({
  endpoint,
  tokenEnv = "TNV_BOT_TOKEN",
  trailingSlash = false,
  securityHeaders: security = true,
} = {}) {
  const slashExclude =
    trailingSlash && typeof trailingSlash === "object" && Array.isArray(trailingSlash.exclude)
      ? trailingSlash.exclude
      : [];
  // Nothing here may break the site. Any failure is swallowed and the request
  // passes through untouched (returning undefined = continue).
  return function middleware(request, context) {
    let url;
    try {
      url = new URL(request.url);
    } catch {
      return;
    }

    try {
      const token = readEnv(tokenEnv);
      const ua = request?.headers?.get?.("user-agent") || "";
      if (token && endpoint && isCrawler(ua)) {
        const report = fetch(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token, ua: ua.slice(0, 500), path: url.pathname.slice(0, 300) }),
        }).catch(() => {});
        if (context && typeof context.waitUntil === "function") context.waitUntil(report);
      }
    } catch {
      // ignore: never fail a page view over analytics
    }

    try {
      if (trailingSlash) {
        const target = trailingSlashTarget(request.method || "GET", url.pathname, slashExclude);
        if (target) {
          const location = new URL(target + url.search, url.origin);
          return new Response(null, { status: 308, headers: { Location: location.href } });
        }
      }
      const headers = {
        ...(securityHeaders(url.pathname, security) || {}),
        ...(machineCopyHeaders(url.pathname, url.origin) || {}),
      };
      if (Object.keys(headers).length) return continueWith(headers);
    } catch {
      // ignore: fall through to the origin unchanged
    }
  };
}
