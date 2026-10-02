import { abs } from "../lib/url";

export function generateArticleMarkdown(config: {
  article: {
    id: string;
    body: string;
    data: {
      title: string;
      description: string;
      date: string;
      updatedDate?: string;
      faqs?: { question: string; answer: string }[];
      externalLinks?: { label: string; url: string }[];
    };
  };
  author: { id: string; name?: string; data?: { name: string } };
  siteUrl: string;
  articlesBase: string;
}): string {
  const { article, author, siteUrl, articlesBase } = config;
  const data = article.data;
  const authorName = author.name ?? author.data?.name ?? "";
  const canonical = abs(`/${articlesBase}/${article.id}/`, siteUrl);
  const authorUrl = abs(`/team/${author.id}/`, siteUrl);

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
  lines.push(`Author: [${authorName}](${authorUrl})`, "", (article.body ?? "").trimEnd());

  lines.push("", "## FAQ");
  for (const faq of data.faqs ?? []) {
    lines.push("", `### ${faq.question}`, "", faq.answer);
  }

  lines.push("", "## Sources");
  for (const link of data.externalLinks ?? []) {
    lines.push(`- [${link.label}](${link.url})`);
  }

  return `${lines.join("\n").replace(/\n{3,}/g, "\n\n").replace(/\n+$/, "")}\n`;
}
