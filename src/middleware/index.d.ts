export declare const CRAWLER_UA_TOKENS: readonly string[];

export declare function isCrawler(userAgent: string | null | undefined): boolean;

export interface BotMiddlewareOptions {
  /** Full ingest URL. */
  endpoint: string;
  /** Env var holding the site's token. Default "TNV_BOT_TOKEN". */
  tokenEnv?: string;
}

export interface WaitUntilContext {
  waitUntil?: (promise: Promise<unknown>) => void;
}

export declare function createBotMiddleware(
  options: BotMiddlewareOptions
): (request: Request, context?: WaitUntilContext) => void;
