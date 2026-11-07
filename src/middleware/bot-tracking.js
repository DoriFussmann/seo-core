/**
 * AI-crawler tracking for Vercel Routing Middleware.
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

export function createBotMiddleware({ endpoint, tokenEnv = "TNV_BOT_TOKEN" } = {}) {
  // Tracking must never break the site. Any failure is swallowed and the
  // request passes through untouched (returning undefined = continue).
  return function middleware(request, context) {
    try {
      const token = readEnv(tokenEnv);
      if (!token || !endpoint) return;
      const ua = request?.headers?.get?.("user-agent") || "";
      if (!isCrawler(ua)) return;
      const { pathname } = new URL(request.url);
      const report = fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, ua: ua.slice(0, 500), path: pathname.slice(0, 300) }),
      }).catch(() => {});
      if (context && typeof context.waitUntil === "function") context.waitUntil(report);
    } catch {
      // ignore: never fail a page view over analytics
    }
  };
}
