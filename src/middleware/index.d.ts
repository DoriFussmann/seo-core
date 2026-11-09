export declare const CRAWLER_UA_TOKENS: readonly string[];

export declare function isCrawler(userAgent: string | null | undefined): boolean;

export interface BotMiddlewareOptions {
  /** Full ingest URL. */
  endpoint: string;
  /** Env var holding the site's token. Default "TNV_BOT_TOKEN". */
  tokenEnv?: string;
  /**
   * 308 `/page` -> `/page/` and `/x/index.html` -> `/x/`. Off by default.
   * `exclude` lists path prefixes to leave alone (proxied apps: "/api", "/portal").
   */
  trailingSlash?: boolean | { exclude?: string[] };
  /**
   * Baseline security headers on every response (since 1.7.0). Default true.
   * false turns them off; an object can exclude path prefixes and add a CSP.
   */
  securityHeaders?: boolean | SecurityHeaderOptions;
}

export interface SecurityHeaderOptions {
  /** Path prefixes to leave alone (proxied apps: "/portal"). */
  exclude?: string[];
  /** Enforced Content-Security-Policy value. Site-specific; none by default. */
  contentSecurityPolicy?: string;
  /** Content-Security-Policy-Report-Only value, for trying a policy first. */
  contentSecurityPolicyReportOnly?: string;
}

export declare const SECURITY_HEADERS: Readonly<Record<string, string>>;

export declare function securityHeaders(
  pathname: string,
  options?: boolean | SecurityHeaderOptions
): Record<string, string> | null;

export declare function machineCopyHeaders(pathname: string, origin: string): Record<string, string> | null;

export declare function trailingSlashTarget(method: string, pathname: string, exclude?: string[]): string | null;

export interface WaitUntilContext {
  waitUntil?: (promise: Promise<unknown>) => void;
}

export declare function createBotMiddleware(
  options: BotMiddlewareOptions
): (request: Request, context?: WaitUntilContext) => Response | undefined;
