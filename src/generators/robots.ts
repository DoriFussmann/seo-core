import { abs } from "../lib/url";

export type CrawlerPolicy = "allow" | "deny";

/**
 * AI crawlers listed explicitly in robots.txt. Search and user-triggered
 * fetchers (OAI-SearchBot, ChatGPT-User, Claude-SearchBot, Claude-User,
 * Perplexity-User) drive citations in AI answers. CCBot (Common Crawl) is
 * allowed on purpose for model-training visibility. Override per site by
 * spreading this object and changing entries.
 */
export const DEFAULT_AI_CRAWLERS: Readonly<Record<string, CrawlerPolicy>> = Object.freeze({
  GPTBot: "allow",
  "OAI-SearchBot": "allow",
  "ChatGPT-User": "allow",
  ClaudeBot: "allow",
  "Claude-SearchBot": "allow",
  "Claude-User": "allow",
  PerplexityBot: "allow",
  "Perplexity-User": "allow",
  "Google-Extended": "allow",
  "Applebot-Extended": "allow",
  CCBot: "allow",
});

export const DEFAULT_SITEMAP_PATH = "/sitemap.xml";

export function generateRobotsTxt(config: {
  siteUrl: string;
  aiCrawlers?: Record<string, CrawlerPolicy>;
  /** Must match the sitemap the site actually emits. Default "/sitemap.xml". */
  sitemapPath?: string;
}): string {
  const aiCrawlers = config.aiCrawlers ?? DEFAULT_AI_CRAWLERS;
  const lines = ["User-agent: *", "Allow: /", ""];
  for (const [agent, policy] of Object.entries(aiCrawlers)) {
    lines.push(`User-agent: ${agent}`);
    lines.push(policy === "deny" ? "Disallow: /" : "Allow: /");
    lines.push("");
  }
  lines.push(`Sitemap: ${abs(config.sitemapPath ?? DEFAULT_SITEMAP_PATH, config.siteUrl)}`);
  lines.push("");
  return lines.join("\n");
}
