# Changelog

## 1.6.0 — 2026-11-08

Sites adopt it with the version bump alone (TNV "Core Version"). The new
response headers apply to every site that runs `site/middleware.js`. The
trailing-slash redirect is opt-in. New audit checks only warn, so no build
starts failing.

### Added
- **Middleware: canonical header on markdown copies.** `/…/index.md` responses
  get `Link: <…/>; rel="canonical"` pointing at the HTML page, so search
  engines fold the copy into the article rather than index a duplicate.
- **Middleware: `X-Robots-Tag: noindex` on `/llms.txt` and `/llms-full.txt`.**
  AI crawlers still fetch them; they stay out of search results.
- **Middleware: opt-in trailing-slash redirect.**
  `createBotMiddleware({ endpoint, trailingSlash: { exclude: ["/api", "/portal"] } })`
  308-redirects `/page` → `/page/` and `/x/index.html` → `/x/`. It skips paths
  with a file extension, non-GET/HEAD requests and the excluded prefixes. Use
  this instead of vercel.json `"trailingSlash": true` when the site proxies
  another app (that setting would also redirect `/api/*`).
- `DEFAULT_ROBOTS` export (the article schema default, now shared) for site
  layouts to use on every page.
- `machineCopyHeaders()`, `trailingSlashTarget()` (from `seo-core/middleware`) and
  `trailingSlashProblem()` helpers.
- Audit `robotsMeta` (default "warn"): flags an indexable page whose robots meta
  is missing or lacks `max-image-preview:large`.
- Audit `comparisonTables` (default "warn"): flags an article whose h1 or title
  says "vs" or "versus" but has no `<table>`.
- Audit `trailingSlashRedirect` (default "warn"): flags a site whose vercel.json
  doesn't set `"trailingSlash": true` and whose middleware doesn't opt in to
  `trailingSlash`. New `siteRoot` option (default: the parent of `distDir`).

### Changed
- `createBotMiddleware` now returns a `Response` for the cases above and
  `undefined` otherwise. Crawler reporting works exactly as before.

## 1.5.0 — 2026-11-07

Additive. Sites adopt it with the version bump alone (TNV "Core Version"); no
site code changes. Article pages only; the audit result is unchanged.

### Changed
- Article share image (`og:image`, `twitter:image`, Article schema `image`) is
  now JPEG instead of WebP. LinkedIn, Slack, iMessage and several AI answer
  surfaces do not reliably preview WebP.
- The share image is cropped to the exact `ogImageSize` (`fit: "cover"`).
  Before, Astro kept the source's proportions, so a site declaring 1200×630
  served 1200×675 while `og:image:height` said 630.
- Article schema `about` lists each topic once. The pillar keyword and a tag
  with the same text (any case or spacing) no longer appear twice.

### Added
- Article schema `citation`: one `CreativeWork` (name, url) per entry in the
  article's `externalLinks`, the same sources the page already shows.
- `uniqueTopics()` helper (exported).
- `.github/workflows/release-tag.yml`: when a push to `main` carries a
  `package.json` version with no tag, run typecheck and tests, require a
  matching CHANGELOG entry, then create tag `v<version>`. No manual tagging.

## 1.4.1 — 2026-11-06

Fix. Sites adopt it with the version bump alone (TNV "Core Version"). Sites
that removed `site/middleware.js` after 1.4.0 can put it back once on 1.4.1.

### Fixed
- `seo-core/middleware` crashed every request on Vercel with
  `500 MIDDLEWARE_INVOCATION_FAILED`. Vercel runs Routing Middleware on
  Node.js without transpiling `node_modules`, and Node will not load `.ts`
  files from `node_modules` (`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`).
  The middleware is now plain JavaScript (`index.js`, `bot-tracking.js`) with
  types in `index.d.ts`. Same API, same behavior.
- The middleware can no longer fail a page view: any error while reporting a
  crawler hit is swallowed and the request passes through.

### Added
- Tests: `seo-core/middleware` must load in plain Node through the package
  `exports`, and the middleware must not throw on a malformed request.

## 1.4.0 — 2026-11-06

Additive, but its middleware broke production on Vercel: use 1.4.1.

### Added
- Article links open in a new tab (`openLinksInNewTab`, applied in
  `ArticleBody`).
- `seo-core/middleware`: `createBotMiddleware`, `isCrawler` and
  `CRAWLER_UA_TOKENS`, reporting AI and search crawler hits to TNV Analytics.
  Inert until the site sets `TNV_BOT_TOKEN`.

## 1.3.1 — 2026-10-27

Text only. No detection rule changed, so every site keeps the same statuses.

### Changed
- Placeholders: each check now carries plain-language fix instructions for
  site owners working in Cursor or Claude Chat, kept in
  `src/placeholders/guides.ts` and merged into `BLUEPRINT_PLACEHOLDERS` by id.
  - `help` is now one line on what is still wrong.
  - New optional `steps` (numbered actions) and `prompt` (text to paste into
    Claude Chat or Cursor). `checkPlaceholders` passes both through.

### Fixed
- Page images: the help said to save images in `src/assets/`. The template
  renders them with a plain `<img src>`, so they must go in `public/` (the
  guide uses `public/images/` and `src: /images/<file>`).

## 1.3.0 — 2026-10-26

Additive. Nothing in the main entry point changed, so sites adopt it with the
version bump alone (TNV "Core Version"): same build output, same audit result.

### Added
- `seo-core/placeholders`: a live list of what a site built from the template
  still has to replace, and a checker that reports each item's status.
  - `BLUEPRINT_PLACEHOLDERS`: 19 checks for the SEO Blueprint (15 required,
    4 suggested), grouped Site config, Design, Images, Pages, Legal,
    Collections. Each has a stable `id`, a `label`, a `help` line and one of
    five kinds: `markers`, `value`, `exists`, `originals` (template files by
    SHA-256, read from the site's `scripts/template-originals.json`) and
    `imageBriefs` (YAML `image:` briefs with no `src:`).
  - `checkPlaceholders(files, manifest?)` returns per check `placeholder`,
    `replaced`, `review` (template text gone, a person must confirm: privacy,
    terms, testimonials) or `unknown` (expected file or setting missing), with
    file, line and the offending text, plus totals and `clear`.
  - `files` is any `SiteFiles` reader (`list()` + `read()`): `localSiteFiles(root)`
    for a local folder, or one over the GitHub API.
  - `seo-core/placeholders/blueprint.json`: the same list as plain JSON, for
    tools that read it from GitHub at a site's pinned tag. A test keeps it
    equal to `BLUEPRINT_PLACEHOLDERS`.
  - Helpers: `globToRegExp`, `templateFileHash`, `findImageBriefsWithoutSrc`.

## 1.2.0 — 2026-10-24

Additive. Sites adopt it with the version bump alone (TNV "Core Version"); no
site code changes, no new dependencies. Both new audit rules default to "warn",
so an existing site keeps building and only sees new warnings.

### Added
- `LENGTH_RULES`: one source for title and description lengths — article title
  55–60, article and service description 140–160, page title 50–60 (legal
  pages: max 60, see `LEGAL_PAGE_PATHS`), page meta description 140–160.
  Helpers `describeLengthRule()` and `fitsLengthRule()`, type `LengthRule`.
- Audit rule `pageMetaLengths` (default "warn"): a non-article page whose
  `<title>` or meta description is outside `LENGTH_RULES`. Skips 404 and
  paginated listings. The homepage meta description stays an error.
- Audit rule `placeholders` (default "warn"), only once `SITE_URL` is not
  `https://example.com`: a page that still shows `[PLACEHOLDER`, `[GAP:`,
  `Image placeholder`, `Placeholder name` or `Role to be confirmed`, or whose
  title or meta description starts with "Placeholder". Exported as
  `PLACEHOLDER_MARKERS`.

### Changed
- `articleBaseSchema`, `serviceSchema` and the article audit checks read their
  limits from `LENGTH_RULES`. The numbers are unchanged.

## 1.1.0 — 2026-10-20

Additive. Sites adopt it with the version bump alone (TNV "Core Version"); no
site code changes, no new dependencies.

### Added
- Page structured data, completed after every build by the existing
  `seoSitemap()` integration (`enrichPageSchema`). On each indexable page that
  already has JSON-LD it adds only what is missing:
  - a page node (`WebPage`; `AboutPage` for `/about/`, `ContactPage` for
    `/contact/`, `CollectionPage` for `/articles/`) with name, description,
    language, `isPartOf` the WebSite and its breadcrumb. The About page points
    `mainEntity` at its Person; the homepage points `about` at the Organization;
  - a `BreadcrumbList` on every page except the homepage, named from page titles;
  - Organization `description` (homepage meta description) and `alternateName`
    (the domain, e.g. "heyrupert") when the site does not set them.
  Option `pageSchema` on `seoSitemap()`: `{ pageTypes, exclude, organization }`,
  or `false` to turn it off.
- `ArticleLayout` prop `timeZone` (IANA name, default `America/Los_Angeles`).
- `zonedDateTime()`, `stripContentMarkers()`, `enrichPageSchema()`,
  `DEFAULT_PAGE_TYPES`, `DEFAULT_TIME_ZONE`, `SEO_CORE_VERSION`,
  `resetContentCacheOnUpgrade()`.

### Changed
- Article `datePublished` / `dateModified` (JSON-LD) and
  `article:published_time` / `article:modified_time` (meta) are full ISO 8601
  date-times at local midnight with the zone's offset
  (`2026-08-03T00:00:00-07:00`), which clears Google's "invalid datetime" and
  "missing timezone" warnings. The sitemap `lastmod` follows. Visible dates and
  `<time datetime>` are unchanged.
- `schemaType` defaults to `BlogPosting` (was `Article`). Articles that set it
  explicitly keep their value.
- The markdown alternate (`index.md`) and `llms-full.txt` no longer contain TNV
  section markers (`<!-- CMS-INTERNAL:START -->`, `WHERE-THINGS-STAND`, ...).
  The HTML keeps them for TNV.

### Fixed
- After a seo-core version change, `seoSitemap()` clears Astro's content cache
  once, so entries cached by a previous build (locally or in the host's build
  cache) are re-parsed with the current schema defaults.

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
