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

/**
 * Crawlers a robots.txt shuts out of the whole site: the group that applies to
 * the crawler (its own, else `*`) has `Disallow: /` and no `Allow: /`.
 * Path-level rules such as `Disallow: /portal/` are not a block. Checks the
 * DEFAULT_AI_CRAWLERS names unless `agents` is given.
 */
export function blockedCrawlers(robotsTxt: string, agents: readonly string[] = Object.keys(DEFAULT_AI_CRAWLERS)): string[] {
  const groups = new Map<string, string[][]>();
  let names: string[] = [];
  let rules: string[][] = [];
  let inRules = false;
  for (const raw of robotsTxt.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const field = m[1].toLowerCase();
    const value = m[2].trim();
    if (field === "user-agent") {
      if (inRules) {
        names = [];
        rules = [];
        inRules = false;
      }
      names.push(value.toLowerCase());
      const existing = groups.get(value.toLowerCase());
      if (existing) rules = existing;
      else groups.set(value.toLowerCase(), rules);
    } else if (field === "allow" || field === "disallow") {
      if (!names.length) continue;
      inRules = true;
      rules.push([field, value]);
    }
  }
  const whole = (v: string) => v === "/" || v === "/*";
  return agents.filter((agent) => {
    const group = groups.get(agent.toLowerCase()) ?? groups.get("*") ?? [];
    return group.some(([f, v]) => f === "disallow" && whole(v)) && !group.some(([f, v]) => f === "allow" && whole(v));
  });
}
