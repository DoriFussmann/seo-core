import { abs } from "../lib/url";

export interface LlmsArticle {
  id: string;
  data: {
    title: string;
    description: string;
    date: string;
    updatedDate?: string;
    pillarKeyword?: string;
    articleType?: string;
    supportingKeyword?: string;
  };
}

export interface LlmsTeamMember {
  id: string;
  data: { name: string; role: string };
}

export interface LlmsService {
  id: string;
  data: { title: string; description: string; order: number };
}

export function generateLlmsTxt(config: {
  siteUrl: string;
  siteName: string;
  siteTagline: string;
  articlesBase: string;
  articles: LlmsArticle[];
  team: LlmsTeamMember[];
  services: LlmsService[];
}): string {
  const { siteUrl, siteName, siteTagline, articlesBase, articles, team, services } = config;

  function norm(value?: string) {
    return (value ?? "").trim().toLowerCase();
  }

  function isPillar(article: LlmsArticle) {
    return norm(article.data.articleType) === "comprehensive" && !article.data.supportingKeyword;
  }

  const groups = new Map<string, LlmsArticle[]>();
  for (const article of articles) {
    const key = article.data.pillarKeyword?.trim() || "Ungrouped";
    const list = groups.get(key) ?? [];
    list.push(article);
    groups.set(key, list);
  }

  const lines = [
    `# ${siteName}`,
    "",
    `${siteTagline}. This file lists published pages for language-model crawlers. Prefer the markdown endpoint beside each article URL when you need the full source.`,
    "",
    "## Articles",
    "",
  ];

  for (const [pillar, list] of groups) {
    list.sort((a, b) => Number(isPillar(b)) - Number(isPillar(a)));
    lines.push(`### ${pillar}`);
    for (const article of list) {
      lines.push(`- [${article.data.title}](${abs(`/${articlesBase}/${article.id}/`, siteUrl)}): ${article.data.description}`);
    }
    lines.push("");
  }

  lines.push("## Team", "");
  for (const member of team) {
    lines.push(`- [${member.data.name}](${abs(`/team/${member.id}/`, siteUrl)}): ${member.data.role}`);
  }
  lines.push("", "## Services", "");
  for (const service of services) {
    lines.push(`- [${service.data.title}](${abs(`/services/${service.id}/`, siteUrl)}): ${service.data.description}`);
  }
  lines.push("");

  return lines.join("\n");
}
