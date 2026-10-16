import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import {
  abs,
  authorUrl,
  collectSitemapEntries,
  generateLlmsTxt,
  generateRobotsTxt,
  imageSize,
  llmsHeader,
  personNode,
  renderSitemapXml,
  runAudit,
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
  assert.equal(custom.url, authorUrl("jane", SITE, (slug) => `/about/#${slug}`));
});

test("robots: default crawler list and configurable sitemap path", () => {
  const txt = generateRobotsTxt({ siteUrl: SITE });
  assert.match(txt, /User-agent: CCBot\nAllow: \//);
  assert.match(txt, /User-agent: Applebot-Extended/);
  assert.match(txt, /Sitemap: https:\/\/site\.test\/sitemap\.xml\n/);
  assert.match(generateRobotsTxt({ siteUrl: SITE, sitemapPath: "/sitemap-index.xml" }), /sitemap-index\.xml/);
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
