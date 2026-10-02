import { abs } from "../lib/url";
import type { LlmsArticle, LlmsExtraPage, LlmsService, LlmsTeamMember } from "./llms";

const CRAWLER_NOTE =
  "This file lists published pages for language-model crawlers. Prefer the markdown endpoint beside each article URL when you need the full source.";

export function generateLlmsFullTxt(config: {
  siteUrl: string;
  siteName: string;
  siteTagline: string;
  articlesBase: string;
  articles: Array<
    LlmsArticle & {
      body: string;
      data: LlmsArticle["data"] & { draft?: boolean };
    }
  >;
  team: LlmsTeamMember[];
  services: LlmsService[];
  extraPages?: LlmsExtraPage[];
  includeMarkdownLinks?: boolean;
}): string {
  const { siteUrl, siteName, siteTagline, articlesBase, articles } = config;
  const header = `# ${siteName}\n\n${siteTagline}. ${CRAWLER_NOTE}`;
  const published = articles.filter((article) => article.data.draft !== true);

  if (published.length === 0) {
    return `${header}\n`;
  }

  const blocks = published.map((article) => {
    const htmlUrl = abs(`/${articlesBase}/${article.id}/`, siteUrl);
    const meta = [`Canonical: ${htmlUrl}`, `Published: ${article.data.date}`];
    if (article.data.updatedDate && article.data.updatedDate > article.data.date) {
      meta.push(`Updated: ${article.data.updatedDate}`);
    }
    return [
      `## ${article.data.title}`,
      "",
      meta.join("\n"),
      "",
      article.data.description,
      "",
      article.body.trimEnd(),
    ]
      .join("\n")
      .replace(/\n+$/, "");
  });

  return `${header}\n\n${blocks.join("\n\n---\n\n")}\n`;
}
