import { test } from "node:test";
import assert from "node:assert/strict";
import { openLinksInNewTab } from "../src/index";
import { createBotMiddleware, isCrawler } from "../src/middleware/index";

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
