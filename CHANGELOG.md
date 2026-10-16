# Changelog

## 1.0.0 — 2026-10-16

First stable contract. Breaking: every consumer migrates once (see "Migrating from 0.9.x").

### Added
- `seoSitemap()` Astro integration. After the build it writes one `/sitemap.xml`
  from the pages that exist in `dist/`: indexable, self-canonical pages only
  (no 404, redirect stubs or `noindex` pages), `lastmod` from
  `article:modified_time`. Options: `path`, `exclude`.
  Replaces `@astrojs/sitemap`.
- `DEFAULT_AI_CRAWLERS` (11 crawlers, CCBot allowed) and `DEFAULT_SITEMAP_PATH`.
- `ArticleLayout` named slots `header`, `toc`, `footer`, and props `logo`,
  `authorPath`, `ogImageSize`, `articleClass`, `bodyClass`, `defaultStyles`.
  Slug/filename guard, `<time datetime>` on dates, `inLanguage` on WebPage and
  Article nodes, `data-article-body` on the body wrapper.
- Configurable author profile path (`authorPath`) for Person JSON-LD, the
  byline, AuthorBio, llms.txt and the markdown alternate. A path with a
  fragment (`/about/#jane`) becomes the Person `@id`.
- Audit rules, each with an `off | warn | error` level:
  - `organizationLogo` (error): logo is SVG, a favicon, missing, not
    PNG/JPEG/WebP, or under 112×112px (`MIN_LOGO_PX`).
  - `emptySameAs` (warn): Organization `sameAs` is empty.
  - `externalLinks` (warn) + `minExternalLinks` (3): unique external links per article.
  - `unlinkedAttributions` (warn): "according to <Source>" with no link in the same sentence.
  - `slugMatchesFilename` (error): frontmatter `slug` differs from the filename.
  - Always on: the sitemap file exists and `robots.txt` references it
    (`sitemapPath`, default `/sitemap.xml`).
- `imageSize()`, `orgId()`, `websiteId()`, `authorUrl()`, `llmsHeader()`.
- `npm test` (node:test via tsx) and `npm run typecheck`.

### Changed (breaking)
- `SiteIdentity.logo` is required; `orgNode` no longer hardcodes `/favicon.svg`.
- `generateRobotsTxt`: `aiCrawlers` is optional (defaults to
  `DEFAULT_AI_CRAWLERS`); the `Sitemap:` line uses `sitemapPath`, default
  `/sitemap.xml` (was a hardcoded `/sitemap-index.xml`).
- `AuthorBio` takes `href` instead of `slug`.
- `generateLlmsFullTxt` no longer takes `team` / `services` (they were unused).
- `ArticleLayout` default column styles moved to the `.seo-core-article` class
  (applied unless `defaultStyles={false}`).
- Organization and WebSite `url` now end with a slash.

### Fixed
- `abs()` no longer adds a trailing slash to file URLs. Article `og:image`,
  JSON-LD `image` and author photo URLs were emitted as `…/hero.webp/`.
- llms.txt / llms-full.txt no longer print a doubled period after a tagline
  that ends with one. Empty Team / Services sections are omitted.
- `generateLlmsTxt` / `generateArticleMarkdown` / `generateRss` accept entries
  whose `body` is undefined.
- Draft detection now scans `llms-full.txt` and the configured sitemap, and
  matches whole slugs only.

### Migrating from 0.9.x
1. Pin `"seo-core": "github:DoriFussmann/seo-core#v1.0.0"` and run `npm install`
   (the lockfile must move with it).
2. Add a raster logo (PNG/JPEG/WebP, at least 112×112px) under `public/` and
   pass `logo` everywhere a `SiteIdentity` is built (`orgNode`, `websiteNode`)
   and to `ArticleLayout`.
3. Sitemap: remove `@astrojs/sitemap` (dependency and integration) and add
   `seoSitemap()` to `integrations` in `astro.config.mjs`. Search Console and
   Bing should then be pointed at `/sitemap.xml`.
4. robots: drop any local crawler list unless the site deliberately differs;
   `generateRobotsTxt({ siteUrl })` is enough.
5. `generateLlmsFullTxt`: remove the `team` and `services` arguments.
6. Sites that render `AuthorBio` themselves: pass `href` instead of `slug`.
7. Sites whose author pages are not `/team/<slug>/`: pass `authorPath` to
   `ArticleLayout`, `generateLlmsTxt` and `generateArticleMarkdown`.
8. Run the build and the audit. Fix any `organizationLogo` or
   `slugMatchesFilename` errors; review the new warnings.
