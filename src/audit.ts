import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import * as cheerio from "cheerio";

/** URL paths (e.g. "/articles/friend-books/") or a predicate over the page pathname. */
export type PillarHubMatcher = string[] | ((pathname: string) => boolean);

export interface AuditConfig {
  siteUrl: string;
  siteName: string;
  articlesBase: string;
  distDir: string;
  articlesDir?: string;
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
   * When true, article pages fail if the first paragraph after the h1 has
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
}

function pagePathname(rel: string): string {
  if (rel === "index.html" || rel === "") return "/";
  const withoutFile = rel.replace(/index\.html$/, "");
  const withSlash = withoutFile.endsWith("/") ? withoutFile : `${withoutFile}/`;
  return `/${withSlash.replace(/^\/+/, "")}`;
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

/** dateModified, else datePublished, from the first Article/BlogPosting/NewsArticle node. Empty string when that node has no date. */
function articleFreshness(node: unknown): string | undefined {
  let found: string | undefined;
  const visit = (value: unknown): void => {
    if (found !== undefined) return;
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (!value || typeof value !== "object") return;
    const obj = value as Record<string, unknown>;
    if (jsonLdTypeNames(obj["@type"]).some((type) => ARTICLE_JSONLD.has(type))) {
      const modified = typeof obj.dateModified === "string" ? obj.dateModified.trim() : "";
      const published = typeof obj.datePublished === "string" ? obj.datePublished.trim() : "";
      found = modified || published;
      return;
    }
    if (Array.isArray(obj["@graph"])) visit(obj["@graph"]);
  };
  visit(node);
  return found;
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

function collectJsonLdTypes(node: unknown, types: Set<string>): void {
  if (Array.isArray(node)) {
    for (const item of node) collectJsonLdTypes(item, types);
    return;
  }
  if (!node || typeof node !== "object") return;
  const obj = node as Record<string, unknown>;
  const t = obj["@type"];
  if (typeof t === "string") types.add(t);
  else if (Array.isArray(t)) {
    for (const x of t) if (typeof x === "string") types.add(x);
  }
  if (Array.isArray(obj["@graph"])) {
    for (const item of obj["@graph"]) collectJsonLdTypes(item, types);
  }
}

export function runAudit(config: AuditConfig): string[] {
  const { siteUrl, siteName, articlesBase, distDir } = config;
  const requireKeyTakeaways = config.requireKeyTakeaways ?? true;
  const requireWts = config.requireWts ?? true;
  const articlesDir = config.articlesDir ?? join(distDir, "..", "src", "content", "articles");
  const errors: string[] = [];

  function fail(msg: string) {
    errors.push(msg);
  }

  function walkHtml(dir: string, acc: string[] = []): string[] {
    if (!existsSync(dir)) return acc;
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      const st = statSync(full);
      if (st.isDirectory()) walkHtml(full, acc);
      else if (name.endsWith(".html")) acc.push(full);
    }
    return acc;
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

  function draftSlugs(): string[] {
    if (!existsSync(articlesDir)) return [];
    return readdirSync(articlesDir)
      .filter((f) => f.endsWith(".md"))
      .filter((f) => /^draft:\s*true\s*$/m.test(readFileSync(join(articlesDir, f), "utf8")))
      .map((f) => f.replace(/\.md$/, ""));
  }

  if (!existsSync(distDir)) {
    fail(`dist/ is missing at ${distDir}`);
  } else {
    const htmlFiles = walkHtml(distDir);
    const origin = new URL(siteUrl).origin;
    const drafts = draftSlugs();
    const distTextBundle = htmlFiles.map((f) => readFileSync(f, "utf8")).join("\n");

    for (const file of htmlFiles) {
      const rel = relative(distDir, file).replace(/\\/g, "/");
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

      const jsonLdTypes = new Set<string>();
      let jsonLdBlocks = 0;
      let freshnessRaw: string | undefined;
      $("script[type='application/ld+json']").each((_, el) => {
        const raw = $(el).text();
        let parsed: unknown;
        try {
          parsed = JSON.parse(raw);
        } catch {
          fail(`${rel}: JSON-LD did not parse`);
          return;
        }
        jsonLdBlocks += 1;
        collectJsonLdTypes(parsed, jsonLdTypes);
        if (freshnessRaw === undefined) {
          const freshness = articleFreshness(parsed);
          if (freshness !== undefined) freshnessRaw = freshness;
        }
      });
      if (jsonLdBlocks > 0 || isHub) {
        if (!jsonLdTypes.has("Organization")) fail(`${rel}: JSON-LD missing Organization`);
        if (!jsonLdTypes.has("WebSite")) fail(`${rel}: JSON-LD missing WebSite`);
        if (isArticle) {
          if (!jsonLdTypes.has("Article") && !jsonLdTypes.has("BlogPosting") && !jsonLdTypes.has("NewsArticle")) {
            fail(`${rel}: article JSON-LD missing article type`);
          }
          if (!jsonLdTypes.has("BreadcrumbList")) fail(`${rel}: article JSON-LD missing BreadcrumbList`);
          if (!jsonLdTypes.has("Person")) fail(`${rel}: article JSON-LD missing Person`);
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
          let seenH1 = false;
          let foundLead = false;
          let leadLength = 0;
          $("h1, p").each((_, el) => {
            if (foundLead || el.type !== "tag") return;
            if (el.name === "h1") {
              seenH1 = true;
              return;
            }
            if (el.name === "p" && seenH1) {
              leadLength = $(el).text().trim().length;
              foundLead = true;
            }
          });
          if (!seenH1 || !foundLead || leadLength < 120) {
            fail(`${rel}: lead answer is ${leadLength} characters (want at least 120)`);
          }
        }
        if (typeof config.maxContentAgeDays === "number") {
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
      }
    }

    const extras = ["sitemap-index.xml", "sitemap-0.xml", "rss.xml", "llms.txt", "robots.txt"].map((n) =>
      existsSync(join(distDir, n)) ? readFileSync(join(distDir, n), "utf8") : "",
    );
    const haystack = [distTextBundle, ...extras].join("\n");
    for (const slug of drafts) {
      if (haystack.includes(`/${articlesBase}/${slug}`)) {
        fail(`draft slug ${slug} appears in dist/feeds`);
      }
    }

    if (siteUrl !== "https://example.com") {
      if (haystack.includes("example.com")) fail("activated site still contains example.com");
      if (haystack.includes("Site Name")) fail("activated site still contains Site Name");
      if (haystack.includes("TEMPLATE:")) fail("activated site still contains TEMPLATE:");
    }
  }

  if (errors.length) {
    console.error(`audit-dist: ${errors.length} error(s)`);
    for (const err of errors) console.error(` - ${err}`);
    process.exit(1);
  }

  console.log("audit-dist: ok — all HTML gates passed");
  return errors;
}
