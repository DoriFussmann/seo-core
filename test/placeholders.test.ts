import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  BLUEPRINT_PLACEHOLDERS,
  checkPlaceholders,
  findImageBriefsWithoutSrc,
  globToRegExp,
  localSiteFiles,
  templateFileHash,
  type PlaceholderReport,
  type SiteFiles,
} from "../src/placeholders/index";

const LOGO = Buffer.from([137, 80, 78, 71, 1, 2, 3]);
const SVG = "<svg>\r\n<rect/>\r\n</svg>\r\n";

const TEMPLATE_FILES: Record<string, string | Buffer> = {
  "src/config/site.ts": [
    'export const SITE_URL = "https://example.com";',
    'export const SITE_NAME = "Site Name";',
    'export const SITE_TAGLINE = "Primary positioning phrase"; // used in homepage <title>',
    "export const SAME_AS: string[] = [];",
    'export const GA4_MEASUREMENT_ID = "";',
    "export const ARTICLES_DESCRIPTION =",
    '  "Browse every published article: practical guides on technical SEO, content strategy and the operating systems behind them, kept current and reviewed.";',
    "export const TEAM_DESCRIPTION =",
    '  "Meet the people behind this site: the operators and editors who write, review and maintain every guide, and the experience each one brings to the work.";',
  ].join("\n"),
  "Design Guide.md": '# Design Guide — Site Name\n\n```tokens\n{ "brand": { "wordmarkPrimary": "Site", "wordmarkAccent": "Name" } }\n```\n',
  "scripts/template-originals.json": JSON.stringify({
    "public/logo.png": templateFileHash("public/logo.png", LOGO),
    "public/favicon.svg": templateFileHash("public/favicon.svg", SVG.replace(/\r\n/g, "\n")),
  }),
  "public/logo.png": LOGO,
  "public/favicon.svg": SVG,
  "src/content/pages/home.yaml": [
    "route: /",
    "meta_title: Site Name — Primary positioning phrase",
    "sections:",
    "  - type: hero",
    "    slides:",
    "      - image: A quiet desk beside a window.",
    "        alt: Desk",
    "      - image: Two people reviewing a page.",
    "        alt: Two people",
    "        src: ../../assets/home/two.jpg",
    "  - type: trust",
    "    heading: What this template holds",
    "  - type: feature-split",
    "    image: Overhead view of a printed outline.",
    "    alt: Outline",
    "    highlights:",
    "      - title: One",
    "        text: Two",
    "  - type: testimonials",
    "    items:",
    "      - quote: Placeholder quote for layout preview.",
    "        name: Placeholder name",
    "        role: Role to be confirmed",
  ].join("\n"),
  "src/content/pages/contact.yaml": "route: /contact/\nmeta_title: Contact — Site Name\nsections:\n  - type: contact\n    email: hello@example.com\n",
  "src/content/pages/privacy.yaml": "route: /privacy/\nsections:\n  - type: rich-text\n    body: |\n      [PLACEHOLDER: replace with reviewed policy]\n",
  "src/content/pages/terms.yaml": "route: /terms/\nsections:\n  - type: page-header\n    intro: This page is a placeholder.\n",
  "src/content/pages/testimonials.yaml": "route: /testimonials/\nsections:\n  - type: testimonials\n    items:\n      - name: Placeholder name\n",
  "src/content/team/site-author.md": '---\nname: "[PLACEHOLDER: author name]"\n---\n',
  "src/content/services/content-systems.md": "---\ntitle: x\n---\nContent systems is the placeholder service for this template.\n",
  "src/content/articles/technical-seo-foundations.md": "---\ntitle: x\n---\n",
  "node_modules/ignored/README.md": "[PLACEHOLDER",
};

function writeSite(files: Record<string, string | Buffer>): string {
  const root = mkdtempSync(join(tmpdir(), "seo-core-placeholder-site-"));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

function byId(report: PlaceholderReport, id: string) {
  const result = report.results.find((r) => r.id === id);
  assert.ok(result, `missing result ${id}`);
  return result;
}

test("placeholders: blueprint.json is the same list as BLUEPRINT_PLACEHOLDERS", () => {
  const json = JSON.parse(readFileSync(new URL("../src/placeholders/blueprint.json", import.meta.url), "utf8"));
  assert.deepEqual(json, BLUEPRINT_PLACEHOLDERS);
  const ids = BLUEPRINT_PLACEHOLDERS.checks.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length, "check ids must be unique");
});

test("placeholders: globs", () => {
  assert.ok(globToRegExp("src/content/pages/*.yaml").test("src/content/pages/home.yaml"));
  assert.ok(!globToRegExp("src/content/pages/*.yaml").test("src/content/pages/sub/home.yaml"));
  assert.ok(globToRegExp("src/**/*.md").test("src/a/b/c.md"));
  assert.ok(globToRegExp("src/**/*.md").test("src/c.md"));
  assert.ok(globToRegExp("Design Guide.md").test("Design Guide.md"));
  assert.ok(!globToRegExp("a.b").test("axb"));
});

test("placeholders: image briefs without src, in list items and mappings", () => {
  const yaml = String(TEMPLATE_FILES["src/content/pages/home.yaml"]);
  const found = findImageBriefsWithoutSrc(yaml);
  assert.deepEqual(
    found.map((f) => f.brief),
    ["A quiet desk beside a window.", "Overhead view of a printed outline."],
  );
  const srcAbove = "  - type: feature-split\n    src: ../a.jpg\n    image: Brief\n    alt: A\n";
  assert.deepEqual(findImageBriefsWithoutSrc(srcAbove), []);
  const srcFirstInItem = "slides:\n  - src: ../a.jpg\n    image: Brief\n  - image: Other\n";
  assert.deepEqual(findImageBriefsWithoutSrc(srcFirstInItem).map((f) => f.brief), ["Other"]);
});

test("placeholders: a fresh template copy reports every required item", async () => {
  const root = writeSite(TEMPLATE_FILES);
  try {
    const report = await checkPlaceholders(localSiteFiles(root));
    assert.equal(report.clear, false);
    for (const id of [
      "site-url",
      "site-name",
      "site-tagline",
      "same-as",
      "wordmark",
      "template-images",
      "image-briefs",
      "page-copy",
      "home-template-sections",
      "privacy",
      "terms",
      "testimonials",
      "author",
      "services",
      "demo-articles",
    ]) {
      assert.equal(byId(report, id).status, "placeholder", id);
    }
    assert.equal(byId(report, "ga4-id").level, "suggested");
    assert.equal(byId(report, "ga4-id").status, "placeholder");
    assert.equal(byId(report, "author-slug").status, "placeholder");
    assert.equal(byId(report, "wordmark").findings.length, 2);
    assert.equal(byId(report, "template-images").findings.length, 2, "CRLF svg still matches its LF original");
    assert.equal(byId(report, "image-briefs").findings.length, 2);
    assert.ok(byId(report, "page-copy").findings.some((f) => f.file === "src/content/pages/contact.yaml" && f.detail.includes("hello@example.com")));
    assert.ok(!byId(report, "page-copy").findings.some((f) => f.file.endsWith("privacy.yaml")), "legal pages are their own checks");
    assert.ok(byId(report, "author").findings.every((f) => !f.file.startsWith("node_modules")));
    assert.equal(report.required.placeholder, report.required.total);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("placeholders: replaced, review and unknown", async () => {
  const done: Record<string, string | Buffer> = {
    ...TEMPLATE_FILES,
    "src/config/site.ts": [
      'export const SITE_URL = "https://heyrupert.com";',
      'export const SITE_NAME = "Hey Rupert";',
      'export const SITE_TAGLINE = "Pet care that comes home";',
      'export const SAME_AS: string[] = ["https://www.linkedin.com/company/heyrupert"];',
      'export const GA4_MEASUREMENT_ID = "G-ABC123";',
      'export const ARTICLES_DESCRIPTION = "Our guides.";',
      'export const TEAM_DESCRIPTION = "Our team.";',
    ].join("\n"),
    "Design Guide.md": '```tokens\n{ "brand": { "wordmarkPrimary": "Hey", "wordmarkAccent": "Rupert" } }\n```\n',
    "public/logo.png": Buffer.from([137, 80, 78, 71, 9, 9]),
    "public/favicon.svg": "<svg><circle/></svg>\n",
    "src/content/pages/home.yaml": "route: /\nsections:\n  - type: hero\n    slides:\n      - image: Vet at a door.\n        alt: Vet\n        src: ../a.jpg\n",
    "src/content/pages/contact.yaml": "route: /contact/\nsections:\n  - type: contact\n    email: hi@heyrupert.com\n",
    "src/content/pages/privacy.yaml": "route: /privacy/\nsections:\n  - type: rich-text\n    body: Real policy.\n",
    "src/content/pages/terms.yaml": "route: /terms/\nsections:\n  - type: rich-text\n    body: Real terms.\n",
    "src/content/team/site-author.md": '---\nname: "Jane Doe"\n---\n',
    "src/content/services/content-systems.md": "---\ntitle: Home visits\n---\nReal service.\n",
  };
  const root = writeSite(done);
  try {
    unlinkSync(join(root, "src/content/pages/testimonials.yaml"));
    unlinkSync(join(root, "src/content/articles/technical-seo-foundations.md"));
    let report = await checkPlaceholders(localSiteFiles(root));
    const open = report.results.filter((r) => r.level === "required" && !["replaced", "review"].includes(r.status));
    assert.deepEqual(open.map((r) => `${r.id}:${r.status}`), []);
    assert.equal(report.clear, true);
    assert.equal(byId(report, "privacy").status, "review");
    assert.equal(byId(report, "terms").status, "review");
    assert.equal(byId(report, "testimonials").status, "review", "deleting the page is a valid answer, still confirmed by a person");
    assert.equal(byId(report, "author-slug").status, "placeholder", "suggested: file still named site-author.md");
    assert.equal(report.required.review, 3);

    unlinkSync(join(root, "src/content/pages/privacy.yaml"));
    unlinkSync(join(root, "scripts/template-originals.json"));
    writeFileSync(join(root, "src/config/site.ts"), "export const SITE_URL: string = process.env.URL;\n");
    report = await checkPlaceholders(localSiteFiles(root));
    assert.equal(byId(report, "privacy").status, "unknown");
    assert.equal(byId(report, "template-images").status, "unknown");
    assert.equal(byId(report, "site-url").status, "unknown");
    assert.equal(report.clear, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("placeholders: works over any reader (e.g. GitHub) and survives a failing read", async () => {
  const files: SiteFiles = {
    list: async () => ["src/config/site.ts", "src/content/team/a.md"],
    read: async (path) => {
      if (path === "src/content/team/a.md") throw new Error("rate limited");
      return 'export const SITE_URL = "https://example.com";';
    },
  };
  const report = await checkPlaceholders(files, {
    version: 1,
    template: "t",
    checks: [
      { id: "url", label: "URL", group: "g", kind: "value", file: "src/config/site.ts", patterns: ['SITE_URL = "([^"]*)"'], placeholders: ["https://example.com"] },
      { id: "author", label: "Author", group: "g", kind: "markers", files: "src/content/team/*.md", markers: ["x"] },
    ],
  });
  assert.equal(byId(report, "url").status, "placeholder");
  assert.equal(byId(report, "author").status, "unknown");
  assert.match(byId(report, "author").findings[0].detail, /rate limited/);
});
