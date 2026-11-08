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
}

export declare function machineCopyHeaders(pathname: string, origin: string): Record<string, string> | null;

export declare function trailingSlashTarget(method: string, pathname: string, exclude?: string[]): string | null;

export interface WaitUntilContext {
  waitUntil?: (promise: Promise<unknown>) => void;
}

export declare function createBotMiddleware(
  options: BotMiddlewareOptions
): (request: Request, context?: WaitUntilContext) => Response | undefined;
