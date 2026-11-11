import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import { z } from "zod";
import {
  abs,
  articleBaseSchema,
  describeLengthRule,
  fitsLengthRule,
  LENGTH_RULES,
  authorUrl,
  clipToSentence,
  collectSitemapEntries,
  enrichPageSchema,
  generateArticleMarkdown,
  generateLlmsFullTxt,
  generateLlmsTxt,
  generateRss,
  generateRobotsTxt,
  blockedCrawlers,
  imageSize,
  llmsHeader,
  personNode,
  renderSitemapXml,
  resetContentCacheOnUpgrade,
  runAudit,
  trailingSlashProblem,
  COMPARISON_HEADING,
  PRICING_HEADING,
  frontmatterPrompts,
  promptCoverageProblems,
  DEFAULT_ROBOTS,
  DEFAULT_AI_CRAWLERS,
  SEO_CORE_VERSION,
  serviceSchema,
  stripContentMarkers,
  zonedDateTime,
} from "../src/index";

const SITE = "https://site.test";

/** Minimal valid PNG of the given size (one grey pixel row repeated). */
function png(width: number, height: number): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const out = Buffer.alloc(8 + data.length + 4);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc(body), 8 + data.length);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // greyscale
  const raw = Buffer.alloc((width + 1) * height, 0x80);
  for (let y = 0; y < height; y++) raw[y * (width + 1)] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function page(opts: { path: string; title: string; body?: string; robots?: string; canonical?: string; jsonLd?: unknown; modified?: string }) {
  const canonical = opts.canonical ?? `${SITE}${opts.path}`;
  return `<!doctype html><html><head><title>${opts.title}</title>
<meta name="description" content="${"d".repeat(150)}">
${opts.robots ? `<meta name="robots" content="${opts.robots}">` : ""}
<link rel="canonical" href="${canonical}">
${opts.modified ? `<meta property="article:modified_time" content="${opts.modified}">` : ""}
${opts.jsonLd ? `<script type="application/ld+json">${JSON.stringify(opts.jsonLd)}</script>` : ""}
</head><body><main>${opts.body ?? "<h1>Heading for the page</h1>"}</main></body></html>`;
}

function writePage(dist: string, rel: string, html: string) {
  const file = join(dist, rel);
  mkdirSync(join(file, ".."), { recursive: true });
  writeFileSync(file, html);
}

function captureWarnings(fn: () => void): string[] {
  const lines: string[] = [];
  const original = console.warn;
  const log = console.log;
  console.warn = (msg: unknown) => lines.push(String(msg));
  console.log = () => {};
  try {
    fn();
  } finally {
    console.warn = original;
    console.log = log;
  }
  return lines;
}

test("abs: pages get a trailing slash, files and fragments do not break", () => {
  assert.equal(abs("/about", SITE), `${SITE}/about/`);
  assert.equal(abs("/_astro/hero.abc.webp", SITE), `${SITE}/_astro/hero.abc.webp`);
  assert.equal(abs("/llms-full.txt", SITE), `${SITE}/llms-full.txt`);
  assert.equal(abs("/about/#jane", SITE), `${SITE}/about/#jane`);
  assert.equal(abs(`${SITE}/a/b.png`, SITE), `${SITE}/a/b.png`);
});

test("person @id: default team page, or the fragment of a custom profile path", () => {
  const base = { slug: "jane", name: "Jane", role: "Founder", description: "", image: "", sameAs: [], knowsAbout: [], siteUrl: SITE };
  assert.equal(personNode(base)["@id"], `${SITE}/team/jane/#person`);
  const custom = personNode({ ...base, authorPath: (slug) => `/about/#${slug}` });
  assert.equal(custom["@id"], `${SITE}/about/#jane`);
  // url is the profile page without the fragment, the same on every page.
  assert.equal(custom.url, `${SITE}/about/`);
  assert.equal(personNode(base).url, `${SITE}/team/jane/`);
});

test("clipToSentence: keeps whole sentences, never cuts mid-sentence or mid-word", () => {
  const bio =
    "Dori is the founder of Rupert. He was Founder and CEO of The Vets, a home veterinary care company that raised $40M. He mentors founders at Cornell Tech and Yale.";
  assert.equal(clipToSentence(bio, 500), bio);
  assert.equal(clipToSentence(bio, 100), "Dori is the founder of Rupert.");
  assert.equal(
    clipToSentence(bio, 120),
    "Dori is the founder of Rupert. He was Founder and CEO of The Vets, a home veterinary care company that raised $40M."
  );
  assert.equal(clipToSentence("  a\n  b.  ", 50), "a b.");
  const long = clipToSentence("One very long opening sentence without any full stop until the end of it.", 30);
  assert.ok(long.endsWith("…"));
  assert.ok(long.length <= 30);
  assert.ok(!/\s…$/.test(long));
  for (let max = 20; max < bio.length; max += 7) {
    const out = clipToSentence(bio, max);
    assert.ok(out.length <= max, `length at ${max}`);
    assert.ok(/[.…]$/.test(out), `ends cleanly at ${max}: ${out}`);
  }
});

test("article layout schema bio is clipped by sentence, not by character", () => {
  const layout = readFileSync(new URL("../src/layouts/ArticleLayout.astro", import.meta.url), "utf8");
  assert.ok(layout.includes("clipToSentence(author.data.bio"));
  assert.ok(!/bio[^\n]*\.slice\(0,/.test(layout));
  // Schema image is the 800px rendition, not the 96px byline thumbnail.
  assert.ok(layout.includes("image: abs(authorSchemaPhoto.src, siteUrl)"));
});

test("rss: raw HTML in article bodies is passed through, TNV markers are dropped", async () => {
  const body = [
    "## Short answer",
    "",
    '<ul class="glance-grid">',
    '  <li><p class="value">$25K</p></li>',
    "</ul>",
    "",
    "<!-- WHERE-THINGS-STAND:START -->",
    "Plain **text**.",
    "<!-- WHERE-THINGS-STAND:END -->",
  ].join("\n");
  const res = await generateRss({
    siteName: "Site",
    siteTagline: "Tagline",
    siteUrl: SITE,
    articlesBase: "articles",
    site: SITE,
    articles: [{ id: "a", body, data: { title: "A", description: "D", date: "2026-01-01" } }],
  });
  const xml = await res.text();
  assert.ok(xml.includes("&lt;ul class=&quot;glance-grid&quot;&gt;"), "html is escaped once, as XML text");
  assert.ok(!xml.includes("&amp;lt;ul"), "no double escaping");
  assert.ok(!xml.includes("WHERE-THINGS-STAND"));
  assert.ok(xml.includes("&lt;strong&gt;text&lt;/strong&gt;"));
});

test("robots: default crawler list and configurable sitemap path", () => {
  const txt = generateRobotsTxt({ siteUrl: SITE });
  assert.match(txt, /User-agent: CCBot\nAllow: \//);
  assert.match(txt, /User-agent: Applebot-Extended/);
  assert.match(txt, /Sitemap: https:\/\/site\.test\/sitemap\.xml\n/);
  assert.match(generateRobotsTxt({ siteUrl: SITE, sitemapPath: "/sitemap-index.xml" }), /sitemap-index\.xml/);
});

test("blockedCrawlers: reports only site-wide blocks, per applicable group", () => {
  assert.deepEqual(blockedCrawlers(generateRobotsTxt({ siteUrl: SITE })), []);
  assert.deepEqual(
    blockedCrawlers(generateRobotsTxt({ siteUrl: SITE, aiCrawlers: { ...DEFAULT_AI_CRAWLERS, GPTBot: "deny", CCBot: "deny" } })),
    ["GPTBot", "CCBot"],
  );
  // No group of its own: the * group applies.
  assert.equal(blockedCrawlers("User-agent: *\nDisallow: /\n").length, Object.keys(DEFAULT_AI_CRAWLERS).length);
  // Own group wins over *; shared groups; comments; case; CRLF.
  assert.deepEqual(blockedCrawlers("User-agent: *\nDisallow: /\n\nUser-agent: gptbot\nAllow: /\n", ["GPTBot", "ClaudeBot"]), ["ClaudeBot"]);
  assert.deepEqual(blockedCrawlers("User-agent: GPTBot\r\nUser-agent: ClaudeBot\r\nDisallow: / # all\r\n", ["GPTBot", "ClaudeBot", "CCBot"]), ["GPTBot", "ClaudeBot"]);
  // Path rules and an empty Disallow are not a block.
  assert.deepEqual(blockedCrawlers("User-agent: *\nDisallow: /portal/\nDisallow:\n"), []);
});

test("audit reports a robots.txt that blocks AI crawlers", () => {
  const dist = mkdtempSync(join(tmpdir(), "seo-core-aibots-"));
  try {
    writePage(dist, "index.html", page({ path: "/", title: "Home", robots: DEFAULT_ROBOTS }));
    writeFileSync(join(dist, "sitemap.xml"), renderSitemapXml([]));
    const run = (level: string, aiCrawlers: Record<string, "allow" | "deny">) => {
      writeFileSync(join(dist, "robots.txt"), generateRobotsTxt({ siteUrl: SITE, aiCrawlers }));
      return captureWarnings(() =>
        runAudit({ siteUrl: SITE, siteName: "S", articlesBase: "articles", distDir: dist, organizationLogo: "off", aiCrawlerAccess: level as "warn" }),
      ).join("\n");
    };
    const denied = { ...DEFAULT_AI_CRAWLERS, ClaudeBot: "deny" as const };
    assert.match(run("warn", denied), /robots\.txt blocks AI crawlers: ClaudeBot /);
    assert.doesNotMatch(run("off", denied), /blocks AI crawlers/);
    assert.doesNotMatch(run("error", { ...DEFAULT_AI_CRAWLERS }), /blocks AI crawlers/);
  } finally {
    rmSync(dist, { recursive: true, force: true });
  }
});

test("llms.txt: no doubled period, empty sections omitted", () => {
  assert.match(llmsHeader("S", "Ends with a period."), /^# S\n\nEnds with a period\. This file lists/);
  const txt = generateLlmsTxt({ siteUrl: SITE, siteName: "S", siteTagline: "T.", articlesBase: "articles", articles: [] });
  assert.doesNotMatch(txt, /\.\./);
  assert.doesNotMatch(txt, /## Team|## Services/);
});

test("imageSize reads PNG dimensions", () => {
  assert.deepEqual(imageSize(png(300, 120)), { format: "png", width: 300, height: 120 });
  assert.equal(imageSize(Buffer.from("not an image")), null);
});

test("sitemap: only indexable, self-canonical pages; lastmod from article meta; exclusions honoured", () => {
  const dist = mkdtempSync(join(tmpdir(), "seo-core-sitemap-"));
  try {
    writePage(dist, "index.html", page({ path: "/", title: "Home" }));
    writePage(dist, "articles/a/index.html", page({ path: "/articles/a/", title: "A", modified: "2026-10-01" }));
    writePage(dist, "privacy/index.html", page({ path: "/privacy/", title: "P", robots: "noindex, follow" }));
    writePage(dist, "dup/index.html", page({ path: "/dup/", title: "D", canonical: `${SITE}/articles/a/` }));
    writePage(dist, "book/index.html", page({ path: "/book/", title: "B" }));
    writePage(dist, "404.html", page({ path: "/404/", title: "404" }));
    const entries = collectSitemapEntries(dist, SITE, ["/book/"]);
    assert.deepEqual(entries, [
      { loc: `${SITE}/`, lastmod: undefined },
      { loc: `${SITE}/articles/a/`, lastmod: "2026-10-01" },
    ]);
    assert.match(renderSitemapXml(entries), /<lastmod>2026-10-01<\/lastmod>/);
  } finally {
    rmSync(dist, { recursive: true, force: true });
  }
});

test("audit warns on SVG logo, empty sameAs, few external links and unlinked attributions", () => {
  const dist = mkdtempSync(join(tmpdir(), "seo-core-audit-"));
  try {
    const graph = (logo: string) => ({
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "Organization", logo, sameAs: [] },
        { "@type": "WebSite" },
        { "@type": "Article" },
        { "@type": "BreadcrumbList" },
        { "@type": "Person" },
      ],
    });
    const body = `<article><h1>Article heading text here</h1><div data-article-body>
<p>According to Carta, median rounds grew. This sentence links <a href="https://example.org/x">a source</a>.</p>
<p>According to PitchBook, deal counts fell, per <a href="https://pitchbook.com/r">PitchBook</a>.</p>
</div></article>`;
    writePage(dist, "articles/a/index.html", page({ path: "/articles/a/", title: "A".repeat(57), body, jsonLd: graph("/favicon.svg") }));
    writeFileSync(join(dist, "sitemap.xml"), renderSitemapXml([]));
    writeFileSync(join(dist, "robots.txt"), generateRobotsTxt({ siteUrl: SITE }));
    const warnings = captureWarnings(() =>
      runAudit({
        siteUrl: SITE,
        siteName: "S",
        articlesBase: "articles",
        distDir: dist,
        requireWts: false,
        requireKeyTakeaways: false,
        organizationLogo: "warn",
      }),
    ).join("\n");
    assert.match(warnings, /Organization logo is an SVG/);
    assert.match(warnings, /sameAs is empty/);
    assert.match(warnings, /2 external link\(s\) \(want at least 3\)/);
    assert.match(warnings, /unlinked attribution — "According to Carta, median rounds grew\."/);
    assert.doesNotMatch(warnings, /According to PitchBook/);
  } finally {
    rmSync(dist, { recursive: true, force: true });
  }
});

test("audit accepts a raster logo of at least 112px and rejects a short one", () => {
  const dist = mkdtempSync(join(tmpdir(), "seo-core-logo-"));
  try {
    const org = (logo: string) => ({ "@context": "https://schema.org", "@graph": [{ "@type": "Organization", logo, sameAs: ["https://x.test"] }, { "@type": "WebSite" }] });
    writeFileSync(join(dist, "ok.png"), png(512, 512));
    writeFileSync(join(dist, "short.png"), png(384, 102));
    writePage(dist, "index.html", page({ path: "/", title: "Home", jsonLd: org(`${SITE}/ok.png`) }));
    writePage(dist, "b/index.html", page({ path: "/b/", title: "B", jsonLd: org(`${SITE}/short.png`) }));
    writeFileSync(join(dist, "sitemap.xml"), renderSitemapXml([]));
    writeFileSync(join(dist, "robots.txt"), generateRobotsTxt({ siteUrl: SITE }));
    const warnings = captureWarnings(() =>
      runAudit({ siteUrl: SITE, siteName: "S", articlesBase: "articles", distDir: dist, organizationLogo: "warn" }),
    ).join("\n");
    assert.match(warnings, /short\.png is 384×102px/);
    assert.doesNotMatch(warnings, /ok\.png/);
  } finally {
    rmSync(dist, { recursive: true, force: true });
  }
});

test("audit checks frontmatter slug against the filename", () => {
  const root = mkdtempSync(join(tmpdir(), "seo-core-slug-"));
  try {
    const dist = join(root, "dist");
    const articlesDir = join(root, "articles");
    mkdirSync(articlesDir, { recursive: true });
    writeFileSync(join(articlesDir, "right.md"), "---\nslug: right\n---\n");
    writeFileSync(join(articlesDir, "wrong.md"), "---\nslug: \"other\"\n---\n");
    writePage(dist, "index.html", page({ path: "/", title: "Home" }));
    writeFileSync(join(dist, "sitemap.xml"), renderSitemapXml([]));
    writeFileSync(join(dist, "robots.txt"), generateRobotsTxt({ siteUrl: SITE }));
    const warnings = captureWarnings(() =>
      runAudit({ siteUrl: SITE, siteName: "S", articlesBase: "articles", distDir: dist, articlesDir, slugMatchesFilename: "warn" }),
    ).join("\n");
    assert.match(warnings, /wrong\.md: frontmatter slug "other" does not match the filename/);
    assert.doesNotMatch(warnings, /right\.md/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("zonedDateTime: local midnight with the offset of that date", () => {
  assert.equal(zonedDateTime("2026-08-03"), "2026-08-03T00:00:00-07:00");
  assert.equal(zonedDateTime("2026-01-15"), "2026-01-15T00:00:00-08:00");
  // DST changes happen at 2am: midnight is still on the old offset.
  assert.equal(zonedDateTime("2026-03-08"), "2026-03-08T00:00:00-08:00");
  assert.equal(zonedDateTime("2026-11-01"), "2026-11-01T00:00:00-07:00");
  assert.equal(zonedDateTime("2026-08-03", "America/New_York"), "2026-08-03T00:00:00-04:00");
  assert.equal(zonedDateTime("2026-08-03", "UTC"), "2026-08-03T00:00:00+00:00");
  assert.equal(zonedDateTime("2026-08-03", "Asia/Kolkata"), "2026-08-03T00:00:00+05:30");
  assert.equal(zonedDateTime("2026-08-03T09:00:00Z"), "2026-08-03T09:00:00Z");
  assert.throws(() => zonedDateTime("2026-08-03", "Not/AZone"));
  assert.throws(() => zonedDateTime("August 3"));
});

test("articles default to BlogPosting", () => {
  const schema = articleBaseSchema(() => z.string());
  const data = schema.parse({
    title: "T".repeat(57),
    description: "D".repeat(150),
    date: "2026-08-03",
    author: "jane",
    tags: ["a", "b", "c", "d"],
    image: "hero.webp",
    imageAlt: "A hero image",
  });
  assert.equal(data.schemaType, "BlogPosting");
});

test("markdown and llms-full drop TNV section markers", () => {
  const body = "Intro.\n\n<!-- CMS-INTERNAL:START -->\nSee [x](/articles/x/).\n<!-- CMS-INTERNAL:END -->\n\n<!-- WHERE-THINGS-STAND:START -->Summary.<!-- WHERE-THINGS-STAND:END -->\n";
  assert.equal(stripContentMarkers(body), "Intro.\n\nSee [x](/articles/x/).\n\nSummary.\n");
  assert.equal(stripContentMarkers("<!-- a normal comment -->"), "<!-- a normal comment -->");
  const article = { id: "a", body, data: { title: "A", description: "Desc", date: "2026-08-03" } };
  const md = generateArticleMarkdown({ article, author: { name: "Jane", id: "jane" }, siteUrl: SITE, articlesBase: "articles" });
  assert.doesNotMatch(md, /CMS-INTERNAL|WHERE-THINGS-STAND/);
  assert.match(md, /See \[x\]\(\/articles\/x\/\)\./);
  const full = generateLlmsFullTxt({ siteUrl: SITE, siteName: "S", siteTagline: "T", articlesBase: "articles", articles: [article] });
  assert.doesNotMatch(full, /CMS-INTERNAL|WHERE-THINGS-STAND/);
  assert.doesNotMatch(full, /\n{3,}/);
});

test("page schema: adds page node, breadcrumbs and Organization fields only where missing", () => {
  const dist = mkdtempSync(join(tmpdir(), "seo-core-pages-"));
  const site = "https://www.brandname.test";
  const org = { "@type": "Organization", "@id": `${site}#org`, name: "Brand", logo: `${site}/logo.png` };
  const website = { "@type": "WebSite", "@id": `${site}#website`, name: "Brand" };
  const doc = (...extra: object[]) => ({ "@context": "https://schema.org", "@graph": [org, website, ...extra] });
  const html = (path: string, title: string, jsonLd?: object, robots?: string) =>
    `<!doctype html><html lang="en-US"><head><title>${title}</title>
<meta name="description" content="Description of ${path}">
${robots ? `<meta name="robots" content="${robots}">` : ""}
<link rel="canonical" href="${site}${path}">
${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>` : ""}
</head><body><h1>x</h1></body></html>`;
  const read = (rel: string) => {
    const match = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(readFileSync(join(dist, rel), "utf8"));
    return match ? (JSON.parse(match[1])["@graph"] as Record<string, any>[]) : null;
  };
  const byType = (graph: Record<string, any>[], type: string) => graph.filter((n) => n["@type"] === type);
  try {
    const person = { "@type": "Person", "@id": `${site}/about/#jane` };
    const articleGraph = doc(
      { "@type": "BreadcrumbList", "@id": `${site}/articles/a/#breadcrumb` },
      { "@type": "WebPage", "@id": `${site}/articles/a/` },
      { "@type": "BlogPosting" },
    );
    writePage(dist, "index.html", html("/", "Home title | Brand", doc({ "@type": "FAQPage", mainEntity: [] })));
    writePage(dist, "about/index.html", html("/about/", "Jane Doe | Founder of Brand", doc(person)));
    writePage(dist, "articles/index.html", html("/articles/", "Articles — Brand", doc()));
    writePage(dist, "articles/a/index.html", html("/articles/a/", "Article A", articleGraph));
    writePage(dist, "book-call/index.html", html("/book-call/", "Book a Call | Brand", doc()));
    writePage(dist, "privacy/index.html", html("/privacy/", "Privacy", doc(), "noindex, follow"));
    writePage(dist, "plain/index.html", html("/plain/", "Plain"));

    const changed = enrichPageSchema(dist, site, { pageTypes: { "/book-call/": "ContactPage" } });
    assert.equal(changed, 5);

    const home = read("index.html")!;
    const homeOrg = byType(home, "Organization")[0];
    assert.equal(homeOrg.description, "Description of /");
    assert.equal(homeOrg.alternateName, "brandname");
    assert.equal(byType(home, "BreadcrumbList").length, 0);
    const homePage = byType(home, "WebPage")[0];
    assert.equal(homePage["@id"], `${site}/`);
    assert.equal(homePage.name, "Home title");
    assert.equal(homePage.inLanguage, "en-US");
    assert.deepEqual(homePage.isPartOf, { "@id": `${site}#website` });
    assert.deepEqual(homePage.about, { "@id": `${site}#org` });

    const about = read("about/index.html")!;
    const aboutPage = byType(about, "AboutPage")[0];
    assert.deepEqual(aboutPage.mainEntity, { "@id": `${site}/about/#jane` });
    const aboutCrumbs = byType(about, "BreadcrumbList")[0];
    assert.deepEqual(aboutPage.breadcrumb, { "@id": aboutCrumbs["@id"] });
    assert.deepEqual(
      aboutCrumbs.itemListElement.map((c: any) => [c.name, c.item]),
      [["Home", `${site}/`], ["Jane Doe", `${site}/about/`]],
    );

    assert.equal(byType(read("articles/index.html")!, "CollectionPage")[0].name, "Articles");
    assert.equal(byType(read("book-call/index.html")!, "ContactPage")[0].name, "Book a Call");

    // Article: its own page node and breadcrumb are kept; only Organization fields are added.
    const article = read("articles/a/index.html")!;
    assert.equal(byType(article, "WebPage").length, 1);
    assert.equal(byType(article, "BreadcrumbList").length, 1);
    assert.equal(byType(article, "Organization")[0].alternateName, "brandname");

    // Not indexable, or no JSON-LD: untouched.
    assert.equal(byType(read("privacy/index.html")!, "WebPage").length, 0);
    assert.equal(read("plain/index.html"), null);

    // A second run finds nothing to add.
    assert.equal(enrichPageSchema(dist, site, { pageTypes: { "/book-call/": "ContactPage" } }), 0);

    // Values a site sets itself win; organization: false leaves Organization alone.
    writePage(dist, "index.html", html("/", "Home", doc({ "@type": "WebPage", "@id": `${site}/` })));
    enrichPageSchema(dist, site, { organization: false });
    assert.equal(byType(read("index.html")!, "Organization")[0].alternateName, undefined);
  } finally {
    rmSync(dist, { recursive: true, force: true });
  }
});

test("content cache: cleared once per seo-core version", () => {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(SEO_CORE_VERSION, pkg.version);
  const cacheDir = mkdtempSync(join(tmpdir(), "seo-core-cache-"));
  try {
    const store = join(cacheDir, "data-store.json");
    writeFileSync(store, "{}");
    assert.equal(resetContentCacheOnUpgrade(cacheDir), true);
    assert.equal(existsSync(store), false);
    writeFileSync(store, "{}");
    assert.equal(resetContentCacheOnUpgrade(cacheDir), false);
    assert.equal(existsSync(store), true);
    writeFileSync(join(cacheDir, "seo-core-version"), "1.0.0\n");
    assert.equal(resetContentCacheOnUpgrade(cacheDir), true);
  } finally {
    rmSync(cacheDir, { recursive: true, force: true });
  }
});

test("LENGTH_RULES drive the article and service schemas", () => {
  assert.deepEqual(LENGTH_RULES.articleTitle, { min: 55, max: 60 });
  assert.deepEqual(LENGTH_RULES.serviceDescription, { min: 140, max: 160 });
  assert.equal(describeLengthRule(LENGTH_RULES.pageTitle), "50–60");
  assert.equal(describeLengthRule(LENGTH_RULES.legalPageTitle), "max 60");
  assert.equal(fitsLengthRule("x".repeat(60), LENGTH_RULES.legalPageTitle), true);
  assert.equal(fitsLengthRule("x".repeat(61), LENGTH_RULES.legalPageTitle), false);
  const service = (n: number) => serviceSchema.safeParse({ title: "S", description: "d".repeat(n) }).success;
  assert.equal(service(133), false);
  assert.equal(service(140), true);
  assert.equal(service(160), true);
  assert.equal(service(161), false);
});

function metaPage(path: string, title: string, desc: string, body = "<h1>Heading for the page</h1>") {
  return `<!doctype html><html><head><title>${title}</title>
<meta name="description" content="${desc}">
<link rel="canonical" href="${SITE}${path}">
</head><body><main>${body}</main></body></html>`;
}

function auditWarnings(dist: string, extra: Record<string, unknown> = {}): string {
  writeFileSync(join(dist, "sitemap.xml"), renderSitemapXml([]));
  writeFileSync(join(dist, "robots.txt"), generateRobotsTxt({ siteUrl: SITE }));
  return captureWarnings(() =>
    runAudit({ siteUrl: SITE, siteName: "S", articlesBase: "articles", distDir: dist, organizationLogo: "off", ...extra }),
  ).join("\n");
}

test("audit warns on page titles and descriptions outside LENGTH_RULES", () => {
  const dist = mkdtempSync(join(tmpdir(), "seo-core-pagemeta-"));
  try {
    const okTitle = "T".repeat(55);
    const okDesc = "d".repeat(150);
    writePage(dist, "index.html", metaPage("/", "Home title that is too short", okDesc));
    writePage(dist, "about/index.html", metaPage("/about/", okTitle, "d".repeat(120)));
    writePage(dist, "services/index.html", metaPage("/services/", okTitle, okDesc));
    writePage(dist, "privacy/index.html", metaPage("/privacy/", "Privacy Policy | S", okDesc));
    writePage(dist, "terms/index.html", metaPage("/terms/", "T".repeat(61), okDesc));
    writePage(dist, "articles/2/index.html", metaPage("/articles/2/", "Page 2", "short"));
    writePage(dist, "404.html", metaPage("/404/", "Not found", "short"));
    const warnings = auditWarnings(dist);
    assert.match(warnings, /index\.html: page title length 28 \(want 50–60\)/);
    assert.match(warnings, /about\/index\.html: page meta description length 120 \(want 140–160\)/);
    assert.doesNotMatch(warnings, /services\/index\.html: page/);
    assert.doesNotMatch(warnings, /privacy\/index\.html: page title/);
    assert.match(warnings, /terms\/index\.html: page title length 61 \(want max 60\)/);
    assert.doesNotMatch(warnings, /articles\/2\/index\.html: page/);
    assert.doesNotMatch(warnings, /404\.html: page/);

    const off = auditWarnings(dist, { pageMetaLengths: "off" });
    assert.doesNotMatch(off, /page title length|page meta description length/);
  } finally {
    rmSync(dist, { recursive: true, force: true });
  }
});

test("audit flags placeholder text only after activation", () => {
  const dist = mkdtempSync(join(tmpdir(), "seo-core-placeholders-"));
  try {
    const desc = "d".repeat(150);
    writePage(
      dist,
      "testimonials/index.html",
      metaPage("/testimonials/", "T".repeat(55), desc, `<h1>Heading for the page</h1><p>[PLACEHOLDER: real client testimonial]</p><p>Role to be confirmed</p>`),
    );
    writePage(
      dist,
      "about/index.html",
      metaPage("/about/", "T".repeat(55), `Placeholder ${"d".repeat(140)}`, `<h1>Heading for the page</h1><div class="placeholder-frame"><p>Image placeholder</p></div>`),
    );
    writePage(dist, "services/index.html", metaPage("/services/", "T".repeat(55), desc));
    const warnings = auditWarnings(dist);
    assert.match(warnings, /testimonials\/index\.html: template placeholder text still live — "\[PLACEHOLDER", "Role to be confirmed"/);
    assert.match(warnings, /about\/index\.html: template placeholder text still live — "Image placeholder", "meta description starts with Placeholder"/);
    assert.doesNotMatch(warnings, /services\/index\.html: template placeholder/);

    const templateDist = mkdtempSync(join(tmpdir(), "seo-core-placeholders-template-"));
    let template = "";
    try {
      const TEMPLATE = "https://example.com";
      writePage(
        templateDist,
        "testimonials/index.html",
        `<!doctype html><html><head><title>${"T".repeat(55)}</title><meta name="description" content="${desc}"><link rel="canonical" href="${TEMPLATE}/testimonials/"></head><body><main><h1>Heading for the page</h1><p>[PLACEHOLDER: quote]</p></main></body></html>`,
      );
      writeFileSync(join(templateDist, "sitemap.xml"), renderSitemapXml([]));
      writeFileSync(join(templateDist, "robots.txt"), generateRobotsTxt({ siteUrl: TEMPLATE }));
      template = captureWarnings(() =>
        runAudit({ siteUrl: TEMPLATE, siteName: "S", articlesBase: "articles", distDir: templateDist, organizationLogo: "off" }),
      ).join("\n");
    } finally {
      rmSync(templateDist, { recursive: true, force: true });
    }
    assert.doesNotMatch(template, /template placeholder/);
  } finally {
    rmSync(dist, { recursive: true, force: true });
  }
});

test("uniqueTopics drops repeats case- and space-insensitively, keeps order", async () => {
  const { uniqueTopics } = await import("../src/lib/topics");
  assert.deepEqual(
    uniqueTopics(["ai adoption", "AI  Adoption", "ai adoption framework", "", undefined, "ai integration", "ai adoption"]),
    ["ai adoption", "ai adoption framework", "ai integration"]
  );
});

test("audit warns on robots meta without max-image-preview:large and on comparison articles without a table", () => {
  const dist = mkdtempSync(join(tmpdir(), "seo-core-robots-"));
  try {
    writePage(dist, "index.html", page({ path: "/", title: "Home", robots: "index, follow" }));
    writePage(dist, "about/index.html", page({ path: "/about/", title: "About", robots: DEFAULT_ROBOTS }));
    writePage(dist, "hidden/index.html", page({ path: "/hidden/", title: "Hidden", robots: "noindex, follow" }));
    writePage(dist, "articles/a/index.html", page({ path: "/articles/a/", title: "A".repeat(57), robots: DEFAULT_ROBOTS, body: "<article><h1>Seed vs Series A</h1><p>x</p></article>" }));
    writePage(dist, "articles/b/index.html", page({ path: "/articles/b/", title: "B".repeat(57), robots: DEFAULT_ROBOTS, body: "<article><h1>Angels versus VCs</h1><table><tr><td>x</td></tr></table></article>" }));
    writePage(dist, "articles/c/index.html", page({ path: "/articles/c/", title: "C".repeat(57), robots: DEFAULT_ROBOTS, body: "<article><h1>Canvas of the market</h1></article>" }));
    const warnings = auditWarnings(dist, { requireWts: false, requireKeyTakeaways: false, externalLinks: "off" });
    assert.match(warnings, /^ ! index\.html: robots meta "index, follow" lacks max-image-preview:large/m);
    assert.doesNotMatch(warnings, /about\/index\.html: robots/);
    assert.doesNotMatch(warnings, /hidden\/index\.html: robots/);
    assert.match(warnings, /articles\/a\/index\.html: comparison article has no <table>/);
    assert.doesNotMatch(warnings, /articles\/b\/index\.html: comparison/);
    assert.doesNotMatch(warnings, /articles\/c\/index\.html: comparison/);
  } finally {
    rmSync(dist, { recursive: true, force: true });
  }
});

test("trailingSlashProblem passes on vercel.json trailingSlash or opted-in middleware", () => {
  const root = mkdtempSync(join(tmpdir(), "seo-core-slash-"));
  try {
    assert.equal(trailingSlashProblem(root), null);
    writeFileSync(join(root, "vercel.json"), JSON.stringify({ redirects: [] }));
    assert.match(trailingSlashProblem(root) ?? "", /both return 200/);
    writeFileSync(join(root, "middleware.js"), 'createBotMiddleware({ endpoint: "x", trailingSlash: { exclude: ["/api"] } });');
    assert.equal(trailingSlashProblem(root), null);
    rmSync(join(root, "middleware.js"));
    writeFileSync(join(root, "vercel.json"), JSON.stringify({ trailingSlash: true }));
    assert.equal(trailingSlashProblem(root), null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("comparison and pricing headings: lists and alternatives count, everyday phrases do not", () => {
  for (const h of [
    "Seed vs Series A",
    "Foundersuite Alternatives for Founders",
    "The Best Investor Outreach Services and Tools for Founders",
    "Top 10 Fundraising Consultants in 2026",
    "Investor CRMs Compared",
    "Best capital raising advisory firms",
  ]) assert.ok(COMPARISON_HEADING.test(h), h);
  for (const h of ["Best practices for investor updates", "How to find investors with no network", "Topics founders ask about"]) {
    assert.ok(!COMPARISON_HEADING.test(h), h);
  }
  for (const h of ["Capital Raising Fees: What Is Normal", "What does a fractional CFO cost?", "Rupert pricing"]) assert.ok(PRICING_HEADING.test(h), h);
  for (const h of ["Seed vs Series A", "Coffee with investors"]) assert.ok(!PRICING_HEADING.test(h), h);
});

test("audit warns on list, alternatives and pricing articles without a table", () => {
  const dist = mkdtempSync(join(tmpdir(), "seo-core-tables-"));
  try {
    const art = (slug: string, h1: string, extra = "") =>
      writePage(dist, `articles/${slug}/index.html`, page({ path: `/articles/${slug}/`, title: "T".repeat(57), robots: DEFAULT_ROBOTS, body: `<article><h1>${h1}</h1><p>x</p>${extra}</article>` }));
    art("alts", "Foundersuite alternatives for founders");
    art("best", "The best investor outreach services");
    art("fees", "Capital raising fees explained");
    art("fees-table", "Capital raising fees explained", "<table><tr><td>2–5%</td></tr></table>");
    art("plain", "Best practices for investor updates");
    const warnings = auditWarnings(dist, { requireWts: false, requireKeyTakeaways: false, externalLinks: "off", robotsMeta: "off" });
    assert.match(warnings, /articles\/alts\/index\.html: comparison article has no <table>/);
    assert.match(warnings, /articles\/best\/index\.html: comparison article has no <table>/);
    assert.match(warnings, /articles\/fees\/index\.html: pricing article has no <table>/);
    assert.doesNotMatch(warnings, /fees-table\/index\.html: pricing/);
    assert.doesNotMatch(warnings, /plain\/index\.html: (comparison|pricing)/);
    const off = auditWarnings(dist, { requireWts: false, requireKeyTakeaways: false, externalLinks: "off", robotsMeta: "off", comparisonTables: "off", pricingTables: "off" });
    assert.doesNotMatch(off, /has no <table>/);
  } finally {
    rmSync(dist, { recursive: true, force: true });
  }
});

test("frontmatterPrompts: objects and plain strings, ignores bad entries and bad YAML", () => {
  const raw = `---\ntitle: x\nprompts:\n  - prompt: "Is it worth paying for help?"\n    heading: "Is it worth paying for help?"\n  - "How much does it cost?"\n  - heading: "no prompt"\n  - prompt: ""\n---\nbody`;
  assert.deepEqual(frontmatterPrompts(raw), [
    { prompt: "Is it worth paying for help?", heading: "Is it worth paying for help?" },
    { prompt: "How much does it cost?" },
  ]);
  assert.deepEqual(frontmatterPrompts("---\ntitle: x\n---\n"), []);
  assert.deepEqual(frontmatterPrompts("---\nprompts: [unclosed\n---\n"), []);
});

test("promptCoverageProblems: heading present with a short answer passes; missing, long or table-first sections are reported", () => {
  const short = "Usually not at pre-seed. Pay for help only when it improves your process, not for introductions alone.";
  const long = Array.from({ length: 70 }, () => "word").join(" ");
  const html = `<html><body><article><h1>T</h1>
<h2>Is it worth paying for help?</h2><p>${short}</p><p>More detail.</p>
<h2>How much does it cost?</h2><p>${long}</p>
<h3>Consultant vs investment bank</h3><table><tr><td>x</td></tr></table><p>${short}</p>
<h2>Empty section</h2><h2>Next</h2></article></body></html>`;
  const problems = promptCoverageProblems(html, [
    { prompt: "p1", heading: "Is it worth paying for help?" },
    { prompt: "p2", heading: "How much does it cost?" },
    { prompt: "p3", heading: "Consultant vs investment bank" },
    { prompt: "p4", heading: "Empty section" },
    { prompt: "p5", heading: "Missing heading" },
    { prompt: "p6" },
  ]);
  assert.equal(problems.length, 5);
  assert.ok(!problems.some((p) => p.includes('"p1"')));
  assert.match(problems.join("\n"), /"p2": section "How much does it cost\?" opens with 70 words \(want a direct answer of at most 60\)/);
  assert.match(problems.join("\n"), /"p3": section "Consultant vs investment bank" does not open with a paragraph/);
  assert.match(problems.join("\n"), /"p4": section "Empty section" does not open with a paragraph/);
  assert.match(problems.join("\n"), /"p5": no h2\/h3 "Missing heading" on the page/);
  assert.match(problems.join("\n"), /"p6" has no section heading/);
  assert.deepEqual(promptCoverageProblems(html, [{ prompt: "p2", heading: "How much does it cost?" }], 80), []);
});

test("audit reports prompt coverage from article frontmatter, skipping drafts and articles without prompts", () => {
  const root = mkdtempSync(join(tmpdir(), "seo-core-prompts-"));
  try {
    const dist = join(root, "dist");
    const articlesDir = join(root, "articles");
    mkdirSync(articlesDir, { recursive: true });
    const fm = (slug: string, extra = "") => `---\nslug: ${slug}\n${extra}prompts:\n  - prompt: "What does it cost?"\n    heading: "What does it cost?"\n---\n`;
    writeFileSync(join(articlesDir, "covered.md"), fm("covered"));
    writeFileSync(join(articlesDir, "uncovered.md"), fm("uncovered"));
    writeFileSync(join(articlesDir, "draft.md"), fm("draft", "draft: true\n"));
    writeFileSync(join(articlesDir, "none.md"), "---\nslug: none\n---\n");
    const body = (h2: string) => `<article><h1>Heading</h1><h2>${h2}</h2><p>Between $3,000 and $10,000 a month for most early-stage companies.</p></article>`;
    for (const [slug, h2] of [["covered", "What does it cost?"], ["uncovered", "Something else"], ["none", "Other"]]) {
      writePage(dist, `articles/${slug}/index.html`, page({ path: `/articles/${slug}/`, title: "T".repeat(57), robots: DEFAULT_ROBOTS, body: body(h2) }));
    }
    const warnings = auditWarnings(dist, { articlesDir, requireWts: false, requireKeyTakeaways: false, externalLinks: "off", pricingTables: "off" });
    assert.match(warnings, /articles\/uncovered\/index\.html: prompt "What does it cost\?": no h2\/h3 "What does it cost\?" on the page/);
    assert.doesNotMatch(warnings, /articles\/(covered|draft|none)\/index\.html: prompt/);
    assert.doesNotMatch(auditWarnings(dist, { articlesDir, requireWts: false, requireKeyTakeaways: false, externalLinks: "off", pricingTables: "off", promptCoverage: "off" }), /: prompt "/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
