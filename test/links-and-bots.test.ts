import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { openLinksInNewTab } from "../src/index";
import {
  createBotMiddleware,
  isCrawler,
  machineCopyHeaders,
  securityHeaders,
  SECURITY_HEADERS,
  trailingSlashTarget,
} from "../src/middleware/index";

test("openLinksInNewTab: internal and external links open in a new tab", () => {
  const out = openLinksInNewTab(
    '<p><a href="/articles/x/">x</a> <a href="https://ext.test/a">y</a></p>',
  );
  assert.equal(
    out,
    '<p><a href="/articles/x/" target="_blank" rel="noopener">x</a> <a href="https://ext.test/a" target="_blank" rel="noopener">y</a></p>',
  );
});

test("openLinksInNewTab: skips anchors, mailto, tel and explicit targets; merges rel", () => {
  assert.equal(openLinksInNewTab('<a href="#h">a</a>'), '<a href="#h">a</a>');
  assert.equal(openLinksInNewTab('<a href="mailto:a@b.c">a</a>'), '<a href="mailto:a@b.c">a</a>');
  assert.equal(openLinksInNewTab('<a href="tel:1">a</a>'), '<a href="tel:1">a</a>');
  assert.equal(openLinksInNewTab('<a href="/x/" target="_self">a</a>'), '<a href="/x/" target="_self">a</a>');
  assert.equal(openLinksInNewTab('<a name="n">a</a>'), '<a name="n">a</a>');
  assert.equal(
    openLinksInNewTab('<a rel="nofollow" href="https://e.test">a</a>'),
    '<a rel="nofollow noopener" href="https://e.test" target="_blank">a</a>',
  );
});

test("isCrawler matches AI and search crawlers, not browsers", () => {
  assert.ok(isCrawler("Mozilla/5.0 AppleWebKit/537.36; compatible; GPTBot/1.2; +https://openai.com/gptbot"));
  assert.ok(isCrawler("Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)"));
  assert.ok(isCrawler("Mozilla/5.0 (compatible; PerplexityBot/1.0)"));
  assert.ok(!isCrawler("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15"));
  assert.ok(!isCrawler(""));
});

test("createBotMiddleware reports crawlers only, and only with a token", async () => {
  const calls: Array<{ url: string; body: unknown }> = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)) });
    return new Response("ok");
  }) as typeof fetch;
  const waits: Promise<unknown>[] = [];
  const ctx = { waitUntil: (p: Promise<unknown>) => void waits.push(p) };
  const mw = createBotMiddleware({ endpoint: "https://tnv.test/ingest", tokenEnv: "SEO_CORE_TEST_TOKEN" });
  const req = (ua: string) => new Request("https://site.test/articles/a/?q=1", { headers: { "user-agent": ua } });
  try {
    delete process.env.SEO_CORE_TEST_TOKEN;
    mw(req("GPTBot/1.2"), ctx);
    process.env.SEO_CORE_TEST_TOKEN = "tok";
    mw(req("Mozilla/5.0 Safari"), ctx);
    mw(req("Mozilla/5.0 (compatible; ClaudeBot/1.0)"), ctx);
    await Promise.all(waits);
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.SEO_CORE_TEST_TOKEN;
  }
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://tnv.test/ingest");
  assert.deepEqual(calls[0].body, { token: "tok", ua: "Mozilla/5.0 (compatible; ClaudeBot/1.0)", path: "/articles/a/" });
});

// Regression for v1.4.0: Vercel runs Routing Middleware on Node.js without
// transpiling node_modules, so "seo-core/middleware" must load in plain Node
// (no tsx, no type stripping). A .ts file here 500s every page in production.
test("seo-core/middleware loads in plain Node through the package exports", () => {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const entry = pkg.exports["./middleware"].default;
  assert.match(entry, /\.js$/, "middleware entry must be plain .js");
  const script = `const m = await import(${JSON.stringify(pathToFileURL(join(root, entry)).href)});
    if (typeof m.createBotMiddleware !== "function") throw new Error("missing export");`;
  const out = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
    encoding: "utf8",
    env: { PATH: process.env.PATH ?? "" },
  });
  assert.equal(out.status, 0, out.stderr);
});

test("createBotMiddleware never throws, even on a malformed request", () => {
  process.env.SEO_CORE_TEST_TOKEN_2 = "tok";
  try {
    const mw = createBotMiddleware({ endpoint: "https://tnv.test/ingest", tokenEnv: "SEO_CORE_TEST_TOKEN_2" });
    assert.doesNotThrow(() => mw({ url: "not a url", headers: new Headers({ "user-agent": "GPTBot" }) } as unknown as Request));
    assert.doesNotThrow(() => mw(undefined as unknown as Request));
  } finally {
    delete process.env.SEO_CORE_TEST_TOKEN_2;
  }
});

test("machineCopyHeaders: canonical Link on index.md, noindex on llms files, nothing elsewhere", () => {
  const o = "https://site.test";
  assert.deepEqual(machineCopyHeaders("/articles/a/index.md", o), { Link: '<https://site.test/articles/a/>; rel="canonical"' });
  assert.deepEqual(machineCopyHeaders("/llms.txt", o), { "X-Robots-Tag": "noindex" });
  assert.deepEqual(machineCopyHeaders("/llms-full.txt", o), { "X-Robots-Tag": "noindex" });
  assert.equal(machineCopyHeaders("/articles/a/", o), null);
  assert.equal(machineCopyHeaders("/robots.txt", o), null);
});

test("trailingSlashTarget: redirects pages and index.html, skips files, excluded prefixes and non-GET", () => {
  assert.equal(trailingSlashTarget("GET", "/about"), "/about/");
  assert.equal(trailingSlashTarget("HEAD", "/articles/a"), "/articles/a/");
  assert.equal(trailingSlashTarget("GET", "/index.html"), "/");
  assert.equal(trailingSlashTarget("GET", "/about/index.html"), "/about/");
  assert.equal(trailingSlashTarget("GET", "/about/"), null);
  assert.equal(trailingSlashTarget("GET", "/"), null);
  assert.equal(trailingSlashTarget("GET", "/robots.txt"), null);
  assert.equal(trailingSlashTarget("GET", "/articles/a/index.md"), null);
  assert.equal(trailingSlashTarget("POST", "/about"), null);
  assert.equal(trailingSlashTarget("GET", "/api/x", ["/api"]), null);
  assert.equal(trailingSlashTarget("GET", "/api", ["/api/"]), null);
  assert.equal(trailingSlashTarget("GET", "/apiary", ["/api"]), "/apiary/");
});

test("createBotMiddleware: headers on every site, trailing-slash redirect only when opted in", () => {
  delete process.env.TNV_BOT_TOKEN;
  const plain = createBotMiddleware({ endpoint: "https://tnv.test/ingest" });
  const md = plain(new Request("https://site.test/articles/a/index.md"));
  assert.ok(md);
  assert.equal(md.headers.get("x-middleware-next"), "1");
  assert.equal(md.headers.get("link"), '<https://site.test/articles/a/>; rel="canonical"');
  assert.equal(md.headers.get("x-content-type-options"), "nosniff");
  // Ordinary pages pass through with only the security headers added.
  const page = plain(new Request("https://site.test/articles/a/"));
  assert.equal(page?.headers.get("x-middleware-next"), "1");
  assert.equal(page?.headers.get("x-frame-options"), "SAMEORIGIN");
  assert.equal(page?.headers.get("link"), null);
  assert.equal(plain(new Request("https://site.test/about"))?.status, 200);

  const slash = createBotMiddleware({ endpoint: "https://tnv.test/ingest", trailingSlash: { exclude: ["/portal"] } });
  const r = slash(new Request("https://site.test/about?x=1"));
  assert.equal(r?.status, 308);
  assert.equal(r?.headers.get("location"), "https://site.test/about/?x=1");
  assert.equal(slash(new Request("https://site.test/portal/home"))?.headers.get("location"), null);
  assert.equal(slash(new Request("https://site.test/about/"))?.status, 200);
});

test("security headers: on by default, can be turned off, excluded per prefix, CSP opt-in", () => {
  delete process.env.TNV_BOT_TOKEN;
  assert.deepEqual(securityHeaders("/"), { ...SECURITY_HEADERS });
  assert.equal(SECURITY_HEADERS["X-Content-Type-Options"], "nosniff");
  assert.equal(SECURITY_HEADERS["Referrer-Policy"], "strict-origin-when-cross-origin");
  assert.equal(securityHeaders("/", false), null);
  assert.equal(securityHeaders("/portal/x", { exclude: ["/portal"] }), null);
  assert.ok(securityHeaders("/portals", { exclude: ["/portal"] }));
  assert.equal(securityHeaders("/", { contentSecurityPolicy: "default-src 'self'" })?.["Content-Security-Policy"], "default-src 'self'");
  assert.equal(
    securityHeaders("/", { contentSecurityPolicyReportOnly: "default-src 'self'" })?.["Content-Security-Policy-Report-Only"],
    "default-src 'self'"
  );
  assert.equal(securityHeaders("/")?.["Content-Security-Policy"], undefined);

  const off = createBotMiddleware({ endpoint: "https://tnv.test/ingest", securityHeaders: false });
  assert.equal(off(new Request("https://site.test/about/")), undefined);
  const md = off(new Request("https://site.test/articles/a/index.md"));
  assert.equal(md?.headers.get("x-content-type-options"), null);
  assert.ok(md?.headers.get("link"));

  const portal = createBotMiddleware({ endpoint: "https://tnv.test/ingest", securityHeaders: { exclude: ["/portal"] } });
  assert.equal(portal(new Request("https://site.test/portal/login")), undefined);
  assert.equal(portal(new Request("https://site.test/")) ?.headers.get("x-frame-options"), "SAMEORIGIN");
});
