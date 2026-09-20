import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import * as cheerio from "cheerio";

export interface AuditConfig {
  siteUrl: string;
  siteName: string;
  articlesBase: string;
  distDir: string;
  articlesDir?: string;
  /** When true (default), articles must contain "Key Takeaways". */
  requireKeyTakeaways?: boolean;
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
      const isArticle =
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
      });
      if (jsonLdBlocks > 0) {
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
        if (!html.includes("WHERE-THINGS-STAND:START")) fail(`${rel}: missing WTS START marker`);
        if (!html.includes("WHERE-THINGS-STAND:END")) fail(`${rel}: missing WTS END marker`);
        if (requireKeyTakeaways && !html.includes("Key Takeaways")) fail(`${rel}: missing Key Takeaways`);
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
