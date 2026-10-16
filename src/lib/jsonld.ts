import { abs } from "./url";

export interface SiteIdentity {
  siteUrl: string;
  siteName: string;
  /**
   * Organization logo: a site path ("/logo.png") or absolute URL to a raster
   * image (PNG, JPEG or WebP) at least 112×112px. The audit fails SVG and
   * favicon logos.
   */
  logo: string;
  sameAs?: string[];
}

/** Author profile path for a team slug. May include a fragment ("/about/#jane-doe"). */
export type AuthorPath = (slug: string) => string;

export const defaultAuthorPath: AuthorPath = (slug) => `/team/${slug}/`;

export function orgId(siteUrl: string): string {
  return `${siteUrl}#org`;
}

export function websiteId(siteUrl: string): string {
  return `${siteUrl}#website`;
}

/** Absolute author profile URL, fragment kept ("https://site/about/#jane-doe"). */
export function authorUrl(slug: string, siteUrl: string, authorPath: AuthorPath = defaultAuthorPath): string {
  return abs(authorPath(slug), siteUrl);
}

export function orgNode(site: SiteIdentity) {
  return {
    "@type": "Organization",
    "@id": orgId(site.siteUrl),
    name: site.siteName,
    url: abs("/", site.siteUrl),
    logo: abs(site.logo, site.siteUrl),
    sameAs: site.sameAs ?? [],
  };
}

export function websiteNode(site: SiteIdentity) {
  return {
    "@type": "WebSite",
    "@id": websiteId(site.siteUrl),
    name: site.siteName,
    url: abs("/", site.siteUrl),
    publisher: { "@id": orgId(site.siteUrl) },
  };
}

export function breadcrumbNode(
  crumbs: { name: string; href: string }[],
  siteUrl: string,
) {
  return {
    "@type": "BreadcrumbList",
    "@id": `${crumbs[crumbs.length - 1]?.href ?? siteUrl}#breadcrumb`,
    itemListElement: crumbs.map((crumb, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: crumb.name,
      item: crumb.href,
    })),
  };
}

export function personNode(opts: {
  slug: string;
  name: string;
  role: string;
  description: string;
  image: string;
  sameAs: string[];
  knowsAbout: string[];
  siteUrl: string;
  authorPath?: AuthorPath;
}) {
  const url = authorUrl(opts.slug, opts.siteUrl, opts.authorPath);
  return {
    "@type": "Person",
    // A profile URL with a fragment already identifies the person on that page.
    "@id": url.includes("#") ? url : `${url}#person`,
    name: opts.name,
    jobTitle: opts.role,
    description: opts.description,
    image: opts.image,
    sameAs: opts.sameAs,
    knowsAbout: opts.knowsAbout,
    url,
  };
}

export function faqPageNode(faqs: { question: string; answer: string }[], pageUrl: string) {
  return {
    "@type": "FAQPage",
    "@id": `${pageUrl}#faq`,
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: { "@type": "Answer", text: faq.answer },
    })),
  };
}
