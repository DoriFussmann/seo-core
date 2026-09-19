import { abs } from "../lib/url";

export function generateRobotsTxt(config: {
  siteUrl: string;
  aiCrawlers: Record<string, "allow" | "deny">;
}): string {
  const lines = [
    "User-agent: *",
    "Allow: /",
    "",
  ];
  for (const [agent, policy] of Object.entries(config.aiCrawlers)) {
    lines.push(`User-agent: ${agent}`);
    lines.push(policy === "deny" ? "Disallow: /" : "Allow: /");
    lines.push("");
  }
  lines.push(`Sitemap: ${abs("/sitemap-index.xml", config.siteUrl)}`);
  lines.push("");
  return lines.join("\n");
}
