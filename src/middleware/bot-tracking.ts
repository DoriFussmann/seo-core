/**
 * AI-crawler tracking for Vercel Routing Middleware.
 *
 * Reports known crawler hits (ChatGPT, Claude, Perplexity, Google, Bing, …) to
 * an analytics endpoint after the response is sent. Human visitors are never
 * touched, and nothing happens until the token env var is set.
 *
 * Site usage — `middleware.js` at the Vercel project root:
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
export const CRAWLER_UA_TOKENS: readonly string[] = Object.freeze([
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

export function isCrawler(userAgent: string | null | undefined): boolean {
  const ua = String(userAgent ?? "").toLowerCase();
  return ua.length > 0 && CRAWLER_UA_TOKENS.some((token) => ua.includes(token));
}

export interface BotMiddlewareOptions {
  /** Full ingest URL. */
  endpoint: string;
  /** Env var holding the site's token. Default "TNV_BOT_TOKEN". */
  tokenEnv?: string;
}

interface WaitUntilContext {
  waitUntil?: (promise: Promise<unknown>) => void;
}

export function createBotMiddleware({ endpoint, tokenEnv = "TNV_BOT_TOKEN" }: BotMiddlewareOptions) {
  return function middleware(request: Request, context?: WaitUntilContext): void {
    const token = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[tokenEnv];
    const ua = request.headers.get("user-agent") || "";
    if (!token || !isCrawler(ua)) return;
    const { pathname } = new URL(request.url);
    const report = fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, ua: ua.slice(0, 500), path: pathname.slice(0, 300) }),
    }).catch(() => {});
    if (context && typeof context.waitUntil === "function") context.waitUntil(report);
  };
}
