import { z } from "zod";
import { ISO_DATE, toIsoDateString } from "./lib/isoDate";

/** YAML Date or YYYY-MM-DD string → YYYY-MM-DD string. */
export const isoDate = z.union([
  z.date().transform((value) => toIsoDateString(value)!),
  z.string().regex(ISO_DATE),
]);

type ImageFn = () => z.ZodTypeAny;

export function articleSchema(image: ImageFn) {
  return z.object({
    title: z.string().min(55).max(60),
    description: z.string().min(140).max(160),
    date: isoDate,
    updatedDate: isoDate.optional(),
    author: z.string(),
    tags: z.array(z.string()).min(4).max(6),
    image: image(),
    imageAlt: z.string().min(10),
    image2: image().optional(),
    image3: image().optional(),
    draft: z.boolean().default(false),
    robots: z
      .string()
      .default("index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1"),
    schemaType: z.enum(["Article", "BlogPosting", "NewsArticle"]).default("Article"),
    locale: z.string().default("en_US"),
    twitterCard: z.enum(["summary", "summary_large_image"]).default("summary_large_image"),
    pillarKeyword: z.string().optional(),
    supportingKeyword: z.string().optional(),
    articleType: z.string().optional(),
    targetKeyword: z.string().optional(),
    slug: z.string().optional(),
    category: z.string().optional(),
    keywords: z.array(z.string()).optional(),
    internalLinks: z
      .array(z.object({ slug: z.string(), anchor: z.string() }))
      .default([]),
    externalLinks: z
      .array(z.object({ label: z.string(), url: z.string().url(), addedAt: isoDate }))
      .default([]),
    faqs: z.array(z.object({ question: z.string(), answer: z.string() })).default([]),
    published_url: z.string().url().optional(),
  });
}

export function teamSchema(image: ImageFn) {
  return z.object({
    name: z.string(),
    role: z.string(),
    bio: z.string(),
    credentials: z.array(z.string()).default([]),
    knowsAbout: z.array(z.string()).default([]),
    photo: image(),
    sameAs: z.array(z.string().url()).default([]),
    email: z.string().email().optional(),
  });
}

export const serviceSchema = z.object({
  title: z.string(),
  description: z.string().min(140).max(160),
  order: z.number().default(0),
  icon: z.string().optional(),
});
