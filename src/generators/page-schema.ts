import { readFileSync, writeFileSync } from "node:fs";
import * as cheerio from "cheerio";
import { distRelative, pagePathname, walkHtml } from "../lib/dist";
import { indexableCanonical, isNotFoundPage, normalizePathname } from "../lib/indexable";
import { breadcrumbNode } from "../lib/jsonld";

/** Page type for well-known paths. Any other indexable page is a "WebPage". */
export const DEFAULT_PAGE_TYPES: Readonly<Record<string, string>> = {
  "/about/": "AboutPage",
  "/contact/": "ContactPage",
  "/articles/": "CollectionPage",
};

export interface PageSchemaOptions {
  /** Page type per pathname, merged over DEFAULT_PAGE_TYPES (e.g. { "/book-call/": "ContactPage" }). */
  pageTypes?: Record<string, string>;
  /** Pathnames left untouched. */
  exclude?: string[];
  /**
   * Fill a missing Organization `description` (from the homepage meta
   * description) and `alternateName` (from the domain). Default true.
   * Values the site sets itself are never replaced.
   */
  organization?: boolean;
}

type JsonObject = Record<string, unknown>;

/** Types that describe the page itself. FAQPage is left out: sites use it as a separate "#faq" node. */
const PAGE_NODE_TYPES = new Set([
  "WebPage",
  "AboutPage",
  "ContactPage",
  "CollectionPage",
  "ProfilePage",
  "ItemPage",
  "QAPage",
  "SearchResultsPage",
  "CheckoutPage",
  "MedicalWebPage",
]);

const JSON_LD_SCRIPT = /(<script\b[^>]*\btype\s*=\s*["']application\/ld\+json["'][^>]*>)([\s\S]*?)(<\/script>)/gi;

interface JsonLdBlock {
  start: number;
  end: number;
  open: string;
  close: string;
  doc: JsonObject;
}

interface BuiltPage {
  file: string;
  pathname: string;
  url: string;
  html: string;
  title: string;
  description: string;
  lang: string;
}

function typeNames(node: JsonObject): string[] {
  const value = node["@type"];
  if (typeof value === "string") return [value];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function graphOf(doc: JsonObject): JsonObject[] {
  const graph = doc["@graph"];
  if (Array.isArray(graph)) return graph.filter((n): n is JsonObject => Boolean(n) && typeof n === "object");
  return [doc];
}

function hasType(node: JsonObject, type: string): boolean {
  return typeNames(node).includes(type);
}

/** Parses every JSON-LD block; null when any block is invalid (the audit reports those). */
function readBlocks(html: string): JsonLdBlock[] | null {
  const blocks: JsonLdBlock[] = [];
  JSON_LD_SCRIPT.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = JSON_LD_SCRIPT.exec(html))) {
    let doc: unknown;
    try {
      doc = JSON.parse(match[2]);
    } catch {
      return null;
    }
    if (!doc || typeof doc !== "object" || Array.isArray(doc)) return null;
    blocks.push({ start: match.index, end: match.index + match[0].length, open: match[1], close: match[3], doc: doc as JsonObject });
  }
  return blocks;
}

/** Turns a single-node document into an @graph document so nodes can be added to it. */
function asGraphDocument(doc: JsonObject): JsonObject {
  if (Array.isArray(doc["@graph"])) return doc;
  const { "@context": context, ...node } = doc;
  return { "@context": context ?? "https://schema.org", "@graph": [node] };
}

function serialize(doc: JsonObject): string {
  // "<" escaped so text inside the JSON can never close the <script> element.
  return JSON.stringify(doc).replace(/</g, "\\u003c");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** "Request a Discovery Call | Rupert" → "Request a Discovery Call". */
function shortTitle(title: string, siteName: string): string {
  let name = title.replace(/\s+/g, " ").trim();
  if (siteName) {
    name = name.replace(new RegExp(`\\s+[|–—:·•-]\\s+${escapeRegExp(siteName)}$`, "i"), "").trim();
  }
  if (name.includes(" | ")) name = name.split(" | ")[0].trim();
  return name;
}

function humanize(segment: string): string {
  const words = decodeURIComponent(segment).replace(/[-_]+/g, " ").trim();
  return words ? words[0].toUpperCase() + words.slice(1) : segment;
}

function squash(value: unknown): string {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * After a static build, completes each indexable page's JSON-LD so every page
 * says what it is:
 *   - a page node (WebPage, AboutPage, CollectionPage, ...) with name,
 *     description, language, isPartOf the WebSite, and its breadcrumb;
 *   - a BreadcrumbList on every page except the homepage;
 *   - Organization `description` and `alternateName` when the site left them out.
 * Only adds what is missing: nodes a page already has are kept as they are, so
 * article pages (which seo-core's ArticleLayout fills completely) are unchanged
 * apart from the Organization fields. Pages without any JSON-LD are skipped.
 * Returns the number of pages changed.
 */
export function enrichPageSchema(distDir: string, siteUrl: string, options: PageSchemaOptions = {}): number {
  const origin = new URL(siteUrl).origin;
  const excluded = new Set((options.exclude ?? []).map(normalizePathname));
  const pageTypes = new Map<string, string>();
  for (const [path, type] of Object.entries({ ...DEFAULT_PAGE_TYPES, ...options.pageTypes })) {
    pageTypes.set(normalizePathname(path), type);
  }
  const fillOrganization = options.organization !== false;

  const pages: BuiltPage[] = [];
  for (const file of walkHtml(distDir)) {
    const rel = distRelative(distDir, file);
    if (isNotFoundPage(rel)) continue;
    const pathname = pagePathname(rel);
    const html = readFileSync(file, "utf8");
    const $ = cheerio.load(html);
    const canonical = indexableCanonical($, pathname, origin);
    if (!canonical) continue;
    pages.push({
      file,
      pathname,
      url: canonical.href,
      html,
      title: $("title").first().text().replace(/\s+/g, " ").trim(),
      description: ($('meta[name="description"]').attr("content") || "").trim(),
      lang: ($("html").attr("lang") || "").trim(),
    });
  }

  const titles = new Map(pages.map((page) => [page.pathname, page.title]));
  const homeDescription = pages.find((page) => page.pathname === "/")?.description ?? "";
  const domainLabel = new URL(siteUrl).hostname.replace(/^www\./, "").split(".")[0] ?? "";

  let changedPages = 0;
  for (const page of pages) {
    if (excluded.has(page.pathname)) continue;
    const blocks = readBlocks(page.html);
    if (!blocks || blocks.length === 0) continue;

    const targetIndex = Math.max(
      0,
      blocks.findIndex((block) => graphOf(block.doc).some((n) => hasType(n, "WebSite") || hasType(n, "Organization"))),
    );
    const target = blocks[targetIndex];
    target.doc = asGraphDocument(target.doc);
    let changed = false;

    const nodes = blocks.flatMap((block) => graphOf(block.doc));
    const website = nodes.find((n) => hasType(n, "WebSite"));
    const organizations = nodes.filter((n) => hasType(n, "Organization"));
    const siteName = String(website?.name ?? organizations[0]?.name ?? "");

    if (fillOrganization) {
      for (const org of organizations) {
        if (!org.description && homeDescription) {
          org.description = homeDescription;
          changed = true;
        }
        if (!org.alternateName && domainLabel && squash(domainLabel) !== squash(org.name)) {
          org.alternateName = domainLabel;
          changed = true;
        }
      }
    }

    const graph = target.doc["@graph"] as JsonObject[];

    let breadcrumb = nodes.find((n) => hasType(n, "BreadcrumbList"));
    if (!breadcrumb && page.pathname !== "/") {
      const crumbs = [{ name: "Home", href: `${origin}/` }];
      let path = "";
      for (const segment of page.pathname.split("/").filter(Boolean)) {
        path += `/${segment}`;
        const title = titles.get(`${path}/`);
        crumbs.push({ name: (title && shortTitle(title, siteName)) || humanize(segment), href: `${origin}${path}/` });
      }
      breadcrumb = breadcrumbNode(crumbs, siteUrl);
      graph.push(breadcrumb);
      changed = true;
    }

    const hasPageNode = nodes.some((n) => typeNames(n).some((t) => PAGE_NODE_TYPES.has(t)) || n["@id"] === page.url);
    if (!hasPageNode) {
      const type = pageTypes.get(page.pathname) ?? "WebPage";
      const node: JsonObject = {
        "@type": type,
        "@id": page.url,
        url: page.url,
        name: shortTitle(page.title, siteName) || page.title,
      };
      if (page.description) node.description = page.description;
      if (page.lang) node.inLanguage = page.lang;
      if (typeof website?.["@id"] === "string") node.isPartOf = { "@id": website["@id"] };
      if (typeof breadcrumb?.["@id"] === "string") node.breadcrumb = { "@id": breadcrumb["@id"] };
      const orgId = organizations.find((org) => typeof org["@id"] === "string")?.["@id"];
      if (type === "AboutPage") {
        const people = nodes.filter((n) => hasType(n, "Person") && typeof n["@id"] === "string");
        if (people.length === 1) node.mainEntity = { "@id": people[0]["@id"] };
        else if (orgId) node.about = { "@id": orgId };
      } else if (page.pathname === "/" && orgId) {
        node.about = { "@id": orgId };
      }
      graph.push(node);
      changed = true;
    }

    if (!changed) continue;
    let html = page.html;
    for (let i = blocks.length - 1; i >= 0; i--) {
      const block = blocks[i];
      html = `${html.slice(0, block.start)}${block.open}${serialize(block.doc)}${block.close}${html.slice(block.end)}`;
    }
    writeFileSync(page.file, html, "utf8");
    changedPages += 1;
  }
  return changedPages;
}
