import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AstroIntegration } from "astro";
import * as cheerio from "cheerio";
import { distRelative, pagePathname, walkHtml } from "../lib/dist";
import { DEFAULT_SITEMAP_PATH } from "./robots";

export interface SitemapOptions {
  /** Output path, relative to the site root. Default "/sitemap.xml". */
  path?: string;
  /** Pathnames to leave out even though they are indexable ("/book-call/"). */
  exclude?: string[];
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

function normalizePathname(path: string): string {
  const trimmed = path.trim().split(/[?#]/)[0];
  const leading = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return leading.endsWith("/") ? leading : `${leading}/`;
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
    if (/(^|\/)404(\/index)?\.html$/.test(rel)) continue;
    const pathname = pagePathname(rel);
    if (excluded.has(pathname)) continue;

    const $ = cheerio.load(readFileSync(file, "utf8"));
    if ($('meta[http-equiv="refresh" i]').length) continue;
    const robots = ($('meta[name="robots"]').attr("content") || "").toLowerCase();
    if (/\bnoindex\b/.test(robots)) continue;

    const canonical = $('link[rel="canonical"]').attr("href");
    if (!canonical) continue;
    let canonicalUrl: URL;
    try {
      canonicalUrl = new URL(canonical);
    } catch {
      continue;
    }
    if (canonicalUrl.origin !== origin || normalizePathname(canonicalUrl.pathname) !== pathname) continue;

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
 * Astro integration: after a static build, writes a single sitemap built from
 * the pages that actually exist in dist/. Nothing to maintain by hand, so it
 * cannot drift from the site. Requires `site` in astro.config.
 */
export function seoSitemap(options: SitemapOptions = {}): AstroIntegration {
  const outputPath = (options.path ?? DEFAULT_SITEMAP_PATH).replace(/^\/+/, "");
  let siteUrl: string | undefined;

  return {
    name: "seo-core-sitemap",
    hooks: {
      "astro:config:done": ({ config }) => {
        siteUrl = config.site;
      },
      "astro:build:done": ({ dir, logger }) => {
        if (!siteUrl) throw new Error("seo-core sitemap: set `site` in astro.config");
        const distDir = fileURLToPath(dir);
        const entries = collectSitemapEntries(distDir, siteUrl, options.exclude);
        writeFileSync(join(distDir, outputPath), renderSitemapXml(entries), "utf8");
        logger.info(`${outputPath} written with ${entries.length} URL(s)`);
      },
    },
  };
}
