import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AstroIntegration } from "astro";
import * as cheerio from "cheerio";
import { resetContentCacheOnUpgrade } from "../lib/content-cache";
import { distRelative, pagePathname, walkHtml } from "../lib/dist";
import { indexableCanonical, isNotFoundPage, normalizePathname } from "../lib/indexable";
import { enrichPageSchema, type PageSchemaOptions } from "./page-schema";
import { DEFAULT_SITEMAP_PATH } from "./robots";

export interface SitemapOptions {
  /** Output path, relative to the site root. Default "/sitemap.xml". */
  path?: string;
  /** Pathnames to leave out even though they are indexable ("/book-call/"). */
  exclude?: string[];
  /**
   * Complete each page's JSON-LD after the build (page node, breadcrumbs,
   * Organization description/alternateName); see `enrichPageSchema`.
   * Default true. Pass options to tune page types, or false to turn it off.
   */
  pageSchema?: boolean | PageSchemaOptions;
}

interface SitemapEntry {
  loc: string;
  lastmod?: string;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

/**
 * One entry per built page that should be indexed: not the 404, not a
 * redirect stub, no `noindex`, and canonical to itself on the site's origin.
 * `lastmod` comes from `article:modified_time` when the page has it.
 */
export function collectSitemapEntries(distDir: string, siteUrl: string, exclude: string[] = []): SitemapEntry[] {
  const origin = new URL(siteUrl).origin;
  const excluded = new Set(exclude.map(normalizePathname));
  const entries: SitemapEntry[] = [];

  for (const file of walkHtml(distDir)) {
    const rel = distRelative(distDir, file);
    if (isNotFoundPage(rel)) continue;
    const pathname = pagePathname(rel);
    if (excluded.has(pathname)) continue;

    const $ = cheerio.load(readFileSync(file, "utf8"));
    const canonicalUrl = indexableCanonical($, pathname, origin);
    if (!canonicalUrl) continue;

    const modified = $('meta[property="article:modified_time"]').attr("content")?.trim();
    entries.push({ loc: canonicalUrl.href, lastmod: modified || undefined });
  }

  return entries.sort((a, b) => a.loc.localeCompare(b.loc));
}

export function renderSitemapXml(entries: SitemapEntry[]): string {
  const urls = entries.map(({ loc, lastmod }) => {
    const lastmodTag = lastmod ? `\n    <lastmod>${escapeXml(lastmod)}</lastmod>` : "";
    return `  <url>\n    <loc>${escapeXml(loc)}</loc>${lastmodTag}\n  </url>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
}

/**
 * Astro integration. Clears Astro's content cache once after a seo-core
 * version change (see `resetContentCacheOnUpgrade`). After a static build,
 * completes each page's JSON-LD
 * (unless `pageSchema: false`) and writes a single sitemap built from the
 * pages that actually exist in dist/. Nothing to maintain by hand, so it
 * cannot drift from the site. Requires `site` in astro.config.
 */
export function seoSitemap(options: SitemapOptions = {}): AstroIntegration {
  const outputPath = (options.path ?? DEFAULT_SITEMAP_PATH).replace(/^\/+/, "");
  let siteUrl: string | undefined;

  return {
    name: "seo-core-sitemap",
    hooks: {
      "astro:config:done": ({ config, logger }) => {
        siteUrl = config.site;
        if (resetContentCacheOnUpgrade(fileURLToPath(config.cacheDir))) {
          logger.info("seo-core version changed: content cache cleared so entries are re-parsed");
        }
      },
      "astro:build:done": ({ dir, logger }) => {
        if (!siteUrl) throw new Error("seo-core sitemap: set `site` in astro.config");
        const distDir = fileURLToPath(dir);
        if (options.pageSchema !== false) {
          const pageOptions = typeof options.pageSchema === "object" ? options.pageSchema : {};
          const changed = enrichPageSchema(distDir, siteUrl, pageOptions);
          logger.info(`structured data completed on ${changed} page(s)`);
        }
        const entries = collectSitemapEntries(distDir, siteUrl, options.exclude);
        writeFileSync(join(distDir, outputPath), renderSitemapXml(entries), "utf8");
        logger.info(`${outputPath} written with ${entries.length} URL(s)`);
      },
    },
  };
}
