import { authorUrl as profileUrl, type AuthorPath } from "../lib/jsonld";
import { stripContentMarkers } from "../lib/markers";
import { abs } from "../lib/url";

export function generateArticleMarkdown(config: {
  article: {
    id: string;
    body?: string;
    data: {
      title: string;
      description: string;
      date: string;
      updatedDate?: string;
      faqs?: { question: string; answer: string }[];
      externalLinks?: { label: string; url: string }[];
    };
  };
  author: { name: string; id: string };
  siteUrl: string;
  articlesBase: string;
  /** Author profile path. Default "/team/<slug>/". */
  authorPath?: AuthorPath;
}): string {
  const { article, author, siteUrl, articlesBase, authorPath } = config;
  const data = article.data;
  const authorName = author.name;
  const canonical = abs(`/${articlesBase}/${article.id}/`, siteUrl);
  const authorUrl = profileUrl(author.id, siteUrl, authorPath);

  const lines: string[] = [
    `# ${data.title}`,
    "",
    data.description,
    "",
    `Canonical: ${canonical}`,
    `Published: ${data.date}`,
  ];
  if (data.updatedDate && data.updatedDate > data.date) {
    lines.push(`Updated: ${data.updatedDate}`);
  }
  lines.push(`Author: [${authorName}](${authorUrl})`, "", stripContentMarkers(article.body ?? "").trimEnd());

  const faqs = data.faqs ?? [];
  if (faqs.length > 0) {
    lines.push("", "## FAQ");
    for (const faq of faqs) {
      lines.push("", `### ${faq.question}`, "", faq.answer);
    }
  }

  const links = data.externalLinks ?? [];
  if (links.length > 0) {
    lines.push("", "## Sources", "");
    for (const link of links) {
      lines.push(`- [${link.label}](${link.url})`);
    }
  }

  return `${lines.join("\n").replace(/\n{3,}/g, "\n\n").replace(/\n+$/, "")}\n`;
}
