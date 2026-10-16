import { authorUrl, type AuthorPath } from "../lib/jsonld";
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

export interface LlmsExtraPage {
  title: string;
  path: string;
  description?: string;
}

const CRAWLER_NOTE =
  "This file lists published pages for language-model crawlers. Prefer the markdown endpoint beside each article URL when you need the full source.";

/** "# Site\n\nTagline. Crawler note." — the tagline's own trailing period is not doubled. */
export function llmsHeader(siteName: string, siteTagline: string): string {
  const tagline = siteTagline.trim().replace(/[.\s]+$/, "");
  return `# ${siteName}\n\n${tagline}. ${CRAWLER_NOTE}`;
}

export function generateLlmsTxt(config: {
  siteUrl: string;
  siteName: string;
  siteTagline: string;
  articlesBase: string;
  articles: LlmsArticle[];
  /** Listed under "## Team" when non-empty. */
  team?: LlmsTeamMember[];
  /** Listed under "## Services" when non-empty. Only pass services that have their own pages. */
  services?: LlmsService[];
  extraPages?: LlmsExtraPage[];
  /** When true (default), each article line links to its markdown mirror. */
  includeMarkdownLinks?: boolean;
  /** Author profile path. Default "/team/<slug>/". */
  authorPath?: AuthorPath;
  /** Service page path. Default "/services/<id>/". */
  servicePath?: (id: string) => string;
}): string {
  const {
    siteUrl,
    siteName,
    siteTagline,
    articlesBase,
    articles,
    team = [],
    services = [],
    extraPages,
    includeMarkdownLinks = true,
    authorPath,
    servicePath = (id: string) => `/services/${id}/`,
  } = config;

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

  const lines = [llmsHeader(siteName, siteTagline), ""];

  if (extraPages?.length) {
    lines.push("## Pages", "");
    for (const page of extraPages) {
      const url = abs(page.path, siteUrl);
      const description = page.description?.trim();
      lines.push(description ? `- [${page.title}](${url}): ${description}` : `- [${page.title}](${url})`);
    }
    lines.push("");
  }

  lines.push("## Articles", "");

  for (const [pillar, list] of groups) {
    list.sort((a, b) => Number(isPillar(b)) - Number(isPillar(a)));
    lines.push(`### ${pillar}`);
    for (const article of list) {
      const htmlUrl = abs(`/${articlesBase}/${article.id}/`, siteUrl);
      const markdown = includeMarkdownLinks ? ` (markdown: ${htmlUrl}index.md)` : "";
      lines.push(`- [${article.data.title}](${htmlUrl}): ${article.data.description}${markdown}`);
    }
    lines.push("");
  }

  if (team.length) {
    lines.push("## Team", "");
    for (const member of team) {
      lines.push(`- [${member.data.name}](${authorUrl(member.id, siteUrl, authorPath)}): ${member.data.role}`);
    }
    lines.push("");
  }

  if (services.length) {
    lines.push("## Services", "");
    for (const service of services) {
      lines.push(`- [${service.data.title}](${abs(servicePath(service.id), siteUrl)}): ${service.data.description}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
