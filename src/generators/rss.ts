import rss from "@astrojs/rss";
import MarkdownIt from "markdown-it";
import { stripContentMarkers } from "../lib/markers";

// html: true so raw HTML blocks in article bodies (stat grids, tables) are
// passed through. With the default (false) markdown-it escapes them and feed
// readers show the tags as literal text.
const parser = new MarkdownIt({ html: true });

export function generateRss(config: {
  siteName: string;
  siteTagline: string;
  siteUrl: string;
  articlesBase: string;
  site: string | URL;
  articles: Array<{
    id: string;
    body?: string;
    data: { title: string; description: string; date: string };
  }>;
}) {
  return rss({
    title: config.siteName,
    description: config.siteTagline,
    site: config.site,
    trailingSlash: true,
    items: config.articles.map((article) => ({
      title: article.data.title,
      description: article.data.description,
      pubDate: new Date(`${article.data.date}T00:00:00.000Z`),
      link: `/${config.articlesBase}/${article.id}/`,
      content: parser.render(stripContentMarkers(article.body ?? "")),
    })),
  });
}
