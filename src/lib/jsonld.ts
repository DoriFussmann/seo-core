import { abs } from "./url";

export interface SiteIdentity {
  siteUrl: string;
  siteName: string;
  sameAs?: string[];
}

export function orgNode(site: SiteIdentity) {
  return {
    "@type": "Organization",
    "@id": `${site.siteUrl}#org`,
    name: site.siteName,
    url: site.siteUrl,
    logo: `${site.siteUrl.replace(/\/+$/, "")}/favicon.svg`,
    sameAs: site.sameAs ?? [],
  };
}

export function websiteNode(site: SiteIdentity) {
  return {
    "@type": "WebSite",
    "@id": `${site.siteUrl}#website`,
    name: site.siteName,
    url: site.siteUrl,
    publisher: { "@id": `${site.siteUrl}#org` },
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
}) {
  return {
    "@type": "Person",
    "@id": `${opts.siteUrl}/team/${opts.slug}/#person`,
    name: opts.name,
    jobTitle: opts.role,
    description: opts.description,
    image: opts.image,
    sameAs: opts.sameAs,
    knowsAbout: opts.knowsAbout,
    url: abs(`/team/${opts.slug}/`, opts.siteUrl),
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
