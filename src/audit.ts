import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import * as cheerio from "cheerio";
import { DEFAULT_SITEMAP_PATH } from "./generators/robots";
import { distRelative, pagePathname, walkHtml } from "./lib/dist";
import { H1_MIN_LENGTH, normalizeHeading } from "./lib/h1";
import { imageSize } from "./lib/image-size";

/** "warn" reports without failing the build; "error" fails it; "off" skips the check. */
export type AuditLevel = "off" | "warn" | "error";

/** URL paths (e.g. "/articles/friend-books/") or a predicate over the page pathname. */
export type PillarHubMatcher = string[] | ((pathname: string) => boolean);

/** Google's minimum logo size for Organization rich results. */
export const MIN_LOGO_PX = 112;

export interface AuditConfig {
  siteUrl: string;
  siteName: string;
  articlesBase: string;
  distDir: string;
  articlesDir?: string;
  /** Sitemap the site emits (and robots.txt must reference). Default "/sitemap.xml". */
  sitemapPath?: string;
  /** When true (default), articles must contain "Key Takeaways". */
  requireKeyTakeaways?: boolean;
  /** When true (default), articles must contain WHERE-THINGS-STAND markers. */
  requireWts?: boolean;
  /**
   * When true, article pages fail if "Key Takeaways" first appears after the
   * first 60% of the article HTML. A missing phrase is not an error. Default off.
   */
  requireKeyTakeawaysEarly?: boolean;
  /**
   * When true, article pages fail if the first paragraph in `.prose-article`
   * (or the first `<p>` outside `<header>` when that class is absent) has
   * fewer than 120 trimmed characters. Default off.
   */
  requireLeadAnswer?: boolean;
  /**
   * When set, article pages fail if the JSON-LD freshness date (dateModified,
   * else datePublished) is older than this many UTC days.
   */
  maxContentAgeDays?: number;
  /**
   * Pillar-hub listing pages under the articles base that are not articles.
   * When omitted, every articles-base detail page is audited as an article.
   */
  pillarHubs?: PillarHubMatcher;
  /** Article <h1> identical to its <title>. Default "warn". */
  h1MatchesTitle?: AuditLevel;
  /** The same <title> (any page) or article <h1> used on more than one page. Default "warn". */
  duplicateHeadings?: AuditLevel;
  /** Organization logo is SVG, a favicon, missing from dist, or under 112px. Default "error". */
  organizationLogo?: AuditLevel;
  /** Organization `sameAs` is empty. Default "warn". */
  emptySameAs?: AuditLevel;
  /** Article has fewer than `minExternalLinks` unique external links. Default "warn". */
  externalLinks?: AuditLevel;
  /** Default 3. */
  minExternalLinks?: number;
  /** "According to <Source>" with no link in the same sentence. Default "warn". */
  unlinkedAttributions?: AuditLevel;
  /** Frontmatter `slug` differs from the article's filename. Default "error". */
  slugMatchesFilename?: AuditLevel;
}

function normalizeAuditPath(path: string): string {
  return path
    .trim()
    .replace(/\\/g, "/")
    .split("#")[0]
    .split("?")[0]
    .replace(/\/index\.html$/, "")
    .replace(/index\.html$/, "")
    .replace(/^\/+|\/+$/g, "");
}

function matchesPillarHub(rel: string, pillarHubs: PillarHubMatcher | undefined): boolean {
  if (!pillarHubs) return false;
  const pathname = pagePathname(rel);
  if (typeof pillarHubs === "function") return pillarHubs(pathname);
  const target = normalizeAuditPath(pathname);
  return pillarHubs.some((hub) => normalizeAuditPath(hub) === target);
}

const ARTICLE_JSONLD = new Set(["Article", "BlogPosting", "NewsArticle"]);

function jsonLdTypeNames(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

/** Every object node in a JSON-LD document, @graph members included. */
function jsonLdNodes(value: unknown, acc: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    for (const item of value) jsonLdNodes(item, acc);
    return acc;
  }
  if (!value || typeof value !== "object") return acc;
  const obj = value as Record<string, unknown>;
  acc.push(obj);
  if (Array.isArray(obj["@graph"])) jsonLdNodes(obj["@graph"], acc);
  return acc;
}

/** dateModified, else datePublished, from the first Article/BlogPosting/NewsArticle node. Empty string when that node has no date. */
function articleFreshness(nodes: Record<string, unknown>[]): string | undefined {
  const node = nodes.find((n) => jsonLdTypeNames(n["@type"]).some((type) => ARTICLE_JSONLD.has(type)));
  if (!node) return undefined;
  const modified = typeof node.dateModified === "string" ? node.dateModified.trim() : "";
  const published = typeof node.datePublished === "string" ? node.datePublished.trim() : "";
  return modified || published;
}

function utcDateOnly(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = Date.UTC(year, month - 1, day);
  const date = new Date(utc);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return utc;
}

function logoUrl(node: Record<string, unknown>): string {
  const logo = node.logo;
  if (typeof logo === "string") return logo.trim();
  if (logo && typeof logo === "object") {
    const url = (logo as Record<string, unknown>).url;
    if (typeof url === "string") return url.trim();
  }
  return "";
}

function frontmatterScalar(raw: string, key: string): string | undefined {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw)?.[1];
  if (!fm) return undefined;
  const match = new RegExp(`^${key}:\\s*(.+?)\\s*$`, "m").exec(fm);
  if (!match) return undefined;
  return match[1].replace(/^(["'])(.*)\1$/, "$2");
}

const ATTRIBUTION = /\b[Aa]ccording to (?:the |a |an )?[A-Z][\w&'’.-]*/g;
const LINK_OPEN = "\u0001";

/** Sentences inside an article body that attribute a claim to a named source without linking it. */
function unlinkedAttributionsIn($: cheerio.CheerioAPI, body: ReturnType<cheerio.CheerioAPI>): string[] {
  const found: string[] = [];
  body.find("p, li, td, blockquote").each((_, el) => {
    const block = $(el).clone();
    if (block.find("p, li").length) return; // the nested block is visited on its own
    block.find("a[href]").each((__, a) => {
      const text = $(a).text().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      $(a).replaceWith(`${LINK_OPEN}${text}`);
    });
    const text = block.text().replace(/\s+/g, " ").trim();
    for (const sentence of text.split(/(?<=[.!?])\s+(?=[A-Z0-9"“(])/)) {
      ATTRIBUTION.lastIndex = 0;
      if (ATTRIBUTION.test(sentence) && !sentence.includes(LINK_OPEN)) {
        found.push(sentence.length > 110 ? `${sentence.slice(0, 107)}…` : sentence);
      }
    }
  });
  return found;
}

export function runAudit(config: AuditConfig): string[] {
  const { siteUrl, articlesBase, distDir } = config;
  const requireKeyTakeaways = config.requireKeyTakeaways ?? true;
  const requireWts = config.requireWts ?? true;
  const articlesDir = config.articlesDir ?? join(distDir, "..", "src", "content", "articles");
  const sitemapFile = (config.sitemapPath ?? DEFAULT_SITEMAP_PATH).replace(/^\/+/, "");
  const h1MatchesTitle = config.h1MatchesTitle ?? "warn";
  const duplicateHeadings = config.duplicateHeadings ?? "warn";
  const organizationLogo = config.organizationLogo ?? "error";
  const emptySameAs = config.emptySameAs ?? "warn";
  const externalLinks = config.externalLinks ?? "warn";
  const minExternalLinks = config.minExternalLinks ?? 3;
  const unlinkedAttributions = config.unlinkedAttributions ?? "warn";
  const slugMatchesFilename = config.slugMatchesFilename ?? "error";
  const errors: string[] = [];
  const warnings: string[] = [];

  function fail(msg: string) {
    errors.push(msg);
  }

  function report(level: AuditLevel, msg: string) {
    if (level === "error") errors.push(msg);
    else if (level === "warn") warnings.push(msg);
  }

  const pagesByTitle = new Map<string, { text: string; pages: string[] }>();
  const articlesByH1 = new Map<string, { text: string; pages: string[] }>();
  function track(map: Map<string, { text: string; pages: string[] }>, text: string, rel: string) {
    const key = normalizeHeading(text);
    if (!key) return;
    const entry = map.get(key) ?? { text, pages: [] };
    entry.pages.push(rel);
    map.set(key, entry);
  }

  function fileForPath(pathname: string): string | null {
    const clean = pathname.split("#")[0].split("?")[0];
    if (!clean || clean === "/") return join(distDir, "index.html");
    const trimmed = clean.replace(/\/+$/, "");
    const asIndex = join(distDir, trimmed, "index.html");
    if (existsSync(asIndex)) return asIndex;
    const asHtml = join(distDir, `${trimmed}.html`);
    if (existsSync(asHtml)) return asHtml;
    const asFile = join(distDir, trimmed);
    if (existsSync(asFile) && statSync(asFile).isFile()) return asFile;
    return null;
  }

  function articleFiles(): { slug: string; raw: string }[] {
    if (!existsSync(articlesDir)) return [];
    return readdirSync(articlesDir)
      .filter((f) => f.endsWith(".md"))
      .map((f) => ({ slug: f.replace(/\.md$/, ""), raw: readFileSync(join(articlesDir, f), "utf8") }));
  }

  const checkedLogos = new Map<string, string | null>();
  function logoProblem(url: string, origin: string): string | null {
    if (!url) return "Organization logo is missing";
    if (/\.svg(?:[?#].*)?$/i.test(url)) return `Organization logo is an SVG (${url}); use a PNG, JPEG or WebP`;
    if (/favicon/i.test(url)) return `Organization logo is a favicon (${url}); use a dedicated logo image`;
    let pathname: string;
    try {
      const parsed = new URL(url, origin);
      if (parsed.origin !== origin) return null; // hosted elsewhere: cannot measure from dist
      pathname = parsed.pathname;
    } catch {
      return `Organization logo is not a valid URL (${url})`;
    }
    const file = fileForPath(pathname);
    if (!file) return `Organization logo ${url} is not in dist`;
    const size = imageSize(readFileSync(file));
    if (!size || size.format === "gif") return `Organization logo ${url} is not a PNG, JPEG or WebP`;
    if (size.width < MIN_LOGO_PX || size.height < MIN_LOGO_PX) {
      return `Organization logo ${url} is ${size.width}×${size.height}px (want at least ${MIN_LOGO_PX}×${MIN_LOGO_PX})`;
    }
    return null;
  }

  if (!existsSync(distDir)) {
    fail(`dist/ is missing at ${distDir}`);
  } else {
    const htmlFiles = walkHtml(distDir);
    const origin = new URL(siteUrl).origin;
    const articles = articleFiles();
    const drafts = articles.filter((a) => /^draft:\s*true\s*$/m.test(a.raw)).map((a) => a.slug);
    const distTextBundle = htmlFiles.map((f) => readFileSync(f, "utf8")).join("\n");
    let sameAsChecked = false;

    for (const article of articles) {
      const slug = frontmatterScalar(article.raw, "slug");
      if (slug !== undefined && slug !== article.slug) {
        report(slugMatchesFilename, `${article.slug}.md: frontmatter slug "${slug}" does not match the filename`);
      }
    }

    for (const file of htmlFiles) {
      const rel = distRelative(distDir, file);
      const html = readFileSync(file, "utf8");
      const $ = cheerio.load(html);
      const is404 = rel.includes("404");
      const isHub = matchesPillarHub(rel, config.pillarHubs);
      const isArticle =
        !isHub &&
        rel.startsWith(`${articlesBase}/`) &&
        rel.endsWith("index.html") &&
        rel !== `${articlesBase}/index.html` &&
        !/\/\d+\/index\.html$/.test(rel);
      const isHome = rel === "index.html";

      const h1 = $("h1");
      if (h1.length !== 1) fail(`${rel}: expected exactly one h1, found ${h1.length}`);

      const title = $("title").first().text().trim();
      if (!title) fail(`${rel}: missing <title>`);
      if (isArticle && (title.length < 55 || title.length > 60)) {
        fail(`${rel}: article title length ${title.length} (want 55–60)`);
      }
      if (title && !is404) track(pagesByTitle, title, rel);
      if (isArticle && h1.length === 1) {
        const h1Text = h1.first().text().replace(/\s+/g, " ").trim();
        track(articlesByH1, h1Text, rel);
        if (title && normalizeHeading(h1Text) === normalizeHeading(title)) {
          report(
            h1MatchesTitle,
            `${rel}: h1 duplicates <title> — set an explicit \`h1\` in frontmatter (at least ${H1_MIN_LENGTH} chars, different from the title)`,
          );
        }
      }

      const desc = $('meta[name="description"]').attr("content") || "";
      if (!desc) fail(`${rel}: missing meta description`);
      if ((isArticle || isHome) && (desc.length < 140 || desc.length > 160)) {
        fail(`${rel}: meta description length ${desc.length} (want 140–160)`);
      }

      const canonical = $('link[rel="canonical"]').attr("href") || "";
      if (!canonical) fail(`${rel}: missing canonical`);
      else {
        if (!canonical.startsWith(siteUrl)) fail(`${rel}: canonical does not start with SITE_URL (${canonical})`);
        if (!/^https?:\/\//.test(canonical)) fail(`${rel}: canonical is not absolute`);
        const expectedPath = rel === "index.html" ? "/" : `/${rel.replace(/index\.html$/, "")}`;
        const canonPath = new URL(canonical).pathname;
        const expected = expectedPath.endsWith("/") ? expectedPath : `${expectedPath}/`;
        if (!is404 && canonPath !== expected && canonPath !== expected.replace(/\/$/, "")) {
          fail(`${rel}: canonical path ${canonPath} does not match file path ${expected}`);
        }
        if (!is404 && !canonical.endsWith("/") && !/\.[a-z0-9]+$/i.test(canonical)) {
          fail(`${rel}: canonical missing trailing slash`);
        }
      }

      const ogDesc = $('meta[property="og:description"]').attr("content") || "";
      if (ogDesc && ogDesc !== desc) fail(`${rel}: og:description !== meta description`);

      const ogImage = $('meta[property="og:image"]').attr("content");
      if (ogImage && !/^https?:\/\//.test(ogImage)) fail(`${rel}: og:image is not absolute`);

      const nodes: Record<string, unknown>[] = [];
      let jsonLdBlocks = 0;
      $("script[type='application/ld+json']").each((_, el) => {
        try {
          jsonLdNodes(JSON.parse($(el).text()), nodes);
          jsonLdBlocks += 1;
        } catch {
          fail(`${rel}: JSON-LD did not parse`);
        }
      });
      const jsonLdTypes = new Set(nodes.flatMap((node) => jsonLdTypeNames(node["@type"])));
      if (jsonLdBlocks > 0 || isHub) {
        if (!jsonLdTypes.has("Organization")) fail(`${rel}: JSON-LD missing Organization`);
        if (!jsonLdTypes.has("WebSite")) fail(`${rel}: JSON-LD missing WebSite`);
        if (isArticle) {
          if (![...ARTICLE_JSONLD].some((type) => jsonLdTypes.has(type))) {
            fail(`${rel}: article JSON-LD missing article type`);
          }
          if (!jsonLdTypes.has("BreadcrumbList")) fail(`${rel}: article JSON-LD missing BreadcrumbList`);
          if (!jsonLdTypes.has("Person")) fail(`${rel}: article JSON-LD missing Person`);
        }
      }

      for (const org of nodes.filter((node) => jsonLdTypeNames(node["@type"]).includes("Organization"))) {
        const url = logoUrl(org);
        if (!checkedLogos.has(url)) {
          checkedLogos.set(url, organizationLogo === "off" ? null : logoProblem(url, origin));
          const problem = checkedLogos.get(url);
          if (problem) report(organizationLogo, `${rel}: ${problem}`);
        }
        if (!sameAsChecked) {
          sameAsChecked = true;
          const sameAs = Array.isArray(org.sameAs) ? org.sameAs.filter((v) => typeof v === "string" && v.trim()) : [];
          if (!sameAs.length) {
            report(emptySameAs, `Organization sameAs is empty — list the brand's official profiles (LinkedIn, Crunchbase…) in SAME_AS`);
          }
        }
      }

      $("a[href]").each((_, el) => {
        const href = $(el).attr("href") || "";
        if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("javascript:")) {
          return;
        }
        let pathname = href;
        try {
          if (/^https?:\/\//i.test(href)) {
            const url = new URL(href);
            if (url.origin !== origin) return;
            pathname = url.pathname;
          }
        } catch {
          return;
        }
        if (!pathname.startsWith("/")) return;
        if (!fileForPath(pathname)) fail(`${rel}: internal href not in dist: ${href}`);
      });

      if (isArticle) {
        if (requireWts && !html.includes("WHERE-THINGS-STAND:START")) fail(`${rel}: missing WTS START marker`);
        if (requireWts && !html.includes("WHERE-THINGS-STAND:END")) fail(`${rel}: missing WTS END marker`);
        if (requireKeyTakeaways && !html.includes("Key Takeaways")) fail(`${rel}: missing Key Takeaways`);
        if (config.requireKeyTakeawaysEarly) {
          const articleHtml = $("article").first().html() ?? html;
          const index = articleHtml.indexOf("Key Takeaways");
          if (index !== -1 && index > articleHtml.length * 0.6) {
            fail(`${rel}: Key Takeaways appears after the first 60% of the article`);
          }
        }
        if (config.requireLeadAnswer) {
          const prose = $(".prose-article").first();
          let foundLead = false;
          let leadLength = 0;
          if (prose.length) {
            const lead = prose.find("p").first();
            if (lead.length) {
              leadLength = lead.text().trim().length;
              foundLead = true;
            }
          } else {
            $("p").each((_, el) => {
              if (foundLead) return;
              if ($(el).closest("header").length) return;
              leadLength = $(el).text().trim().length;
              foundLead = true;
            });
          }
          if (!foundLead || leadLength < 120) {
            fail(`${rel}: lead answer is ${leadLength} characters (want at least 120)`);
          }
        }
        if (typeof config.maxContentAgeDays === "number") {
          const freshnessRaw = articleFreshness(nodes);
          const parsedDay = freshnessRaw ? utcDateOnly(freshnessRaw) : null;
          if (parsedDay == null) {
            fail(`${rel}: article freshness date is missing`);
          } else {
            const now = new Date();
            const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
            const ageDays = (today - parsedDay) / 86400000;
            if (ageDays > config.maxContentAgeDays) {
              fail(`${rel}: content is ${ageDays} days old (max ${config.maxContentAgeDays})`);
            }
          }
        }

        const article = $("article").first();
        const scope = article.length ? article : $("main").first();
        if (externalLinks !== "off") {
          const external = new Set<string>();
          scope.find("a[href]").each((_, el) => {
            const href = $(el).attr("href") || "";
            if (!/^https?:\/\//i.test(href)) return;
            try {
              const url = new URL(href);
              if (url.origin !== origin) external.add(`${url.origin}${url.pathname}`);
            } catch {
              // malformed external href: not counted
            }
          });
          if (external.size < minExternalLinks) {
            report(externalLinks, `${rel}: ${external.size} external link(s) (want at least ${minExternalLinks})`);
          }
        }
        if (unlinkedAttributions !== "off") {
          const bodyEl = $("[data-article-body]").first();
          const found = unlinkedAttributionsIn($, bodyEl.length ? bodyEl : scope);
          for (const sentence of found) {
            report(unlinkedAttributions, `${rel}: unlinked attribution — "${sentence}"`);
          }
        }
      }
    }

    for (const [label, map] of [
      ["<title>", pagesByTitle],
      ["article h1", articlesByH1],
    ] as const) {
      for (const { text, pages } of map.values()) {
        if (pages.length > 1) {
          report(duplicateHeadings, `duplicate ${label} "${text}" on ${pages.length} pages: ${pages.join(", ")}`);
        }
      }
    }

    const sitemapAbs = `${origin}/${sitemapFile}`;
    if (!existsSync(join(distDir, sitemapFile))) fail(`${sitemapFile} is missing from dist`);
    const robots = existsSync(join(distDir, "robots.txt")) ? readFileSync(join(distDir, "robots.txt"), "utf8") : "";
    if (!robots) fail("robots.txt is missing from dist");
    else if (!new RegExp(`^Sitemap:\\s*${sitemapAbs.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "m").test(robots)) {
      fail(`robots.txt does not reference ${sitemapAbs}`);
    }

    const extras = [sitemapFile, "sitemap-index.xml", "sitemap-0.xml", "rss.xml", "llms.txt", "llms-full.txt", "robots.txt"].map((n) =>
      existsSync(join(distDir, n)) ? readFileSync(join(distDir, n), "utf8") : "",
    );
    const haystack = [distTextBundle, ...extras].join("\n");
    for (const slug of drafts) {
      if (haystack.includes(`/${articlesBase}/${slug}/`)) {
        fail(`draft slug ${slug} appears in dist/feeds`);
      }
    }

    if (siteUrl !== "https://example.com") {
      if (haystack.includes("example.com")) fail("activated site still contains example.com");
      if (haystack.includes("Site Name")) fail("activated site still contains Site Name");
      if (haystack.includes("TEMPLATE:")) fail("activated site still contains TEMPLATE:");
    }
  }

  if (warnings.length) {
    console.warn(`audit-dist: ${warnings.length} warning(s)`);
    for (const warning of warnings) console.warn(` ! ${warning}`);
  }

  if (errors.length) {
    console.error(`audit-dist: ${errors.length} error(s)`);
    for (const err of errors) console.error(` - ${err}`);
    process.exit(1);
  }

  console.log("audit-dist: ok — all HTML gates passed");
  return errors;
}
