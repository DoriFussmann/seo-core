/**
 * How to fix each placeholder, written for a site owner working with Cursor or
 * Claude Chat (not a developer). Merged into BLUEPRINT_PLACEHOLDERS by id.
 *
 * - help:   one-line summary of what is wrong.
 * - steps:  numbered actions, in order. Paths are from the repo root (site/…).
 * - prompt: text to paste into Claude Chat (with the repo name) or Cursor.
 *           Square-bracket parts are for the user to fill in.
 */

export interface PlaceholderGuide {
  help: string;
  steps: string[];
  prompt?: string;
}

const PUSH = "Commit and push to the branch TNV publishes to (usually main), then click Re-scan.";

export const BLUEPRINT_GUIDES: Record<string, PlaceholderGuide> = {
  "site-url": {
    help: "The site still points at https://example.com. Every canonical link, sitemap and schema tag uses this value.",
    steps: [
      "Write down the live domain exactly as it loads in the browser, with https:// and no trailing slash (e.g. https://www.mynewwebsite.com). Pick the www or non-www version your domain redirects to in Vercel.",
      "Paste the prompt below into Cursor (or Claude Chat with your repo name), with your domain filled in.",
      PUSH,
    ],
    prompt: 'In site/src/config/site.ts, set SITE_URL to "[https://www.mynewwebsite.com]". Change nothing else. Show me the diff.',
  },
  "site-name": {
    help: 'The site name is still "Site Name". It appears in page titles and schema.',
    steps: [
      "Decide the brand name exactly as it should appear in browser tabs (e.g. Night Ventures).",
      "Paste the prompt below into Cursor with your name filled in.",
      PUSH,
    ],
    prompt: 'In site/src/config/site.ts, set SITE_NAME to "[My Brand]". Change nothing else. Show me the diff.',
  },
  "site-tagline": {
    help: "The tagline is still template text. It shows in the homepage title, footer, RSS and llms.txt.",
    steps: [
      "Write a 5–10 word positioning phrase: what you do and for whom (e.g. Venture studio for B2B software founders). The homepage title becomes \"Site name — tagline\", so keep the two together under about 60 characters.",
      "Paste the prompt below into Cursor with your tagline filled in.",
      PUSH,
    ],
    prompt: 'In site/src/config/site.ts, set SITE_TAGLINE to "[my 5-10 word tagline]". Change nothing else. Show me the diff.',
  },
  "same-as": {
    help: "The list of your brand's official profiles is empty. Google uses it to connect the site to your company.",
    steps: [
      "Open each official company profile you have and copy the full URL from the address bar: LinkedIn company page (not a personal profile), Crunchbase, X, YouTube, GitHub, Instagram.",
      "Only include profiles the company owns. Two real ones are better than five weak ones.",
      "Paste the prompt below into Cursor with your URLs filled in.",
      PUSH,
    ],
    prompt:
      'In site/src/config/site.ts, set SAME_AS to this list of URLs: ["[https://www.linkedin.com/company/...]", "[https://x.com/...]"]. Keep the type annotation (string[]). Change nothing else. Show me the diff.',
  },
  "ga4-id": {
    help: "No Google Analytics ID is set. Optional: skip it if the site does not use Google Analytics.",
    steps: [
      "In Google Analytics, go to Admin → Data streams → click the site's web stream → copy the Measurement ID (starts with G-). No property yet? Create one first, or skip this item.",
      "Paste the prompt below into Cursor with your ID filled in.",
      PUSH,
      "Alternative: set PUBLIC_ANALYTICS_ID in Vercel instead. That works too, but this check cannot see it and will stay amber.",
    ],
    prompt: 'In site/src/config/site.ts, set GA4_MEASUREMENT_ID to "[G-XXXXXXXXXX]". Change nothing else. Show me the diff.',
  },
  "articles-description": {
    help: "The /articles/ page description still talks about SEO (the template's subject). Rewrite it for this site.",
    steps: [
      "Write one sentence on what the site's articles cover and who they help.",
      "Paste the prompt below into Cursor with that sentence filled in.",
      PUSH,
    ],
    prompt:
      "In site/src/config/site.ts, rewrite ARTICLES_DESCRIPTION for a site whose articles cover: [one sentence]. Plain language, 140-160 characters, no quotes inside. Change nothing else. Show me the diff.",
  },
  "team-description": {
    help: "The /team/ page description is still the template's. Rewrite it if it does not fit this site.",
    steps: [
      "Read the current text in the finding below. If it fits, leave it — this item is optional.",
      "Otherwise paste the prompt below into Cursor.",
      PUSH,
    ],
    prompt:
      "In site/src/config/site.ts, rewrite TEAM_DESCRIPTION for this site: [one sentence on who writes and reviews the content]. 140-160 characters, no quotes inside. Change nothing else. Show me the diff.",
  },
  wordmark: {
    help: 'The header logo text still reads "Site Name".',
    steps: [
      "Best: in TNV, open this company → Design and generate the design guide. It writes site/Design Guide.md with your wordmark, colors and fonts. Then Re-scan.",
      "Just the words: split the brand into two parts — the first in the normal text color, the second in the accent color (e.g. Night / Ventures). For a one-word brand, put it all in the first part and leave the second empty.",
      "Paste the prompt below into Cursor with your two parts filled in.",
      PUSH,
    ],
    prompt:
      'In site/Design Guide.md, in the JSON block, set brand.wordmarkPrimary to "[First part]" and brand.wordmarkAccent to "[Accent part]". Also update the prose sentence near the top that says the wordmark is "Site" and "Name". Show me the diff.',
  },
  "template-images": {
    help: "Some image files are still the template's own (logo, favicon, share image, demo images). The findings list which.",
    steps: [
      "Prepare three files with these exact names: logo.png (your logo, PNG, square, at least 112×112 — 512×512 is ideal; not SVG), favicon.svg (browser-tab icon), og-default.png (image shown when a link is shared, 1200×675).",
      "In Cursor, drag the three files into site/public/ and choose Replace for each.",
      "No SVG favicon? Use the prompt below in Claude Chat instead of step 2 for that file.",
      "site/src/assets/team/site-author.png is cleared by the Author profile item; the four files in site/src/assets/articles/ are cleared by the Demo articles item.",
      PUSH,
    ],
    prompt:
      "In my site repo [owner/repo], replace site/public/favicon.svg with a simple SVG monogram: the letter [X] in white, centered on a rounded square filled with [#HEX accent color]. Keep the file name. Commit and push to main.",
  },
  "image-briefs": {
    help: "Page images show a grey box with a text description (a brief) because they have no image file yet.",
    steps: [
      "Read the briefs in the findings below: each is one image the page needs (on the homepage: 3 hero slides and 2 image-and-text blocks). Use your own photos, stock (e.g. Unsplash) or AI-generated images. Landscape, at least 1600 px wide for heroes, 1200 px for the others.",
      "Name them in page order: hero-1.jpg, hero-2.jpg, hero-3.jpg, split-1.jpg, split-2.jpg.",
      "In Cursor, create the folder site/public/images/ and drag the files in. Use public/images — not src/assets, where these images will not load.",
      "Paste the prompt below into Cursor, adding one line per image describing what it shows.",
      "Check the images on the Vercel preview or with npm run dev in site/.",
      PUSH,
    ],
    prompt:
      "In every YAML in site/src/content/pages/, find each image: brief that has no src: next to it. Add a src: line at the same indentation, right under it, pointing to /images/<file>: hero slides in order get /images/hero-1.jpg, /images/hero-2.jpg, /images/hero-3.jpg; feature splits in order get /images/split-1.jpg, /images/split-2.jpg. Use /images/ paths exactly (files are in site/public/images/). Then rewrite each alt: to describe the actual image: [one line per image]. Show me the diff.",
  },
  "page-copy": {
    help: "Pages still have template text: placeholder copy, meta titles and descriptions, hello@example.com, or [GAP: …] notes.",
    steps: [
      "Write a short note (5–10 lines) about the business: what you do, for whom, proof (clients, numbers, years), and the contact email.",
      "Open Claude Chat, attach the note and paste the prompt below with your repo name and email filled in. This is a writing job across several files, so Claude Chat works better than Cursor.",
      "Claude will list any [GAP: …] lines it could not fill from your note. Answer them in the same chat and let it push again.",
      "Read the pages on the Vercel preview, then click Re-scan.",
    ],
    prompt:
      'In my site repo [owner/repo], rewrite every YAML in site/src/content/pages/ except privacy.yaml, terms.yaml and testimonials.yaml for the business in the attached note. Rewrite all visible copy, plus meta_title (under 60 characters) and meta_description (140-160 characters). Replace hello@example.com with [email]. Fill each [GAP: ...] line from my note, or list it for me if the note does not cover it. No "Placeholder", "Site Name" or "example.com" may remain. Keep every YAML key and section type. Commit and push to main, then tell me what you changed and the gaps you could not fill.',
  },
  "home-template-sections": {
    help: "The homepage still has sections that describe the template itself instead of the business.",
    steps: [
      'The findings show which ones remain. They are headed "What this template holds", "Page templates in this seed", "Section types in the library", "Notes for the next edit" and "Section sample".',
      "If you already ran the Page copy prompt, check whether these are gone. If not, paste the prompt below into Claude Chat or Cursor with 2–3 lines about the business.",
      "Delete any section that has no sensible equivalent for your site — fewer, real sections beat filler.",
      PUSH,
    ],
    prompt:
      'In site/src/content/pages/home.yaml, rewrite the sections headed "What this template holds", "Page templates in this seed", "Section types in the library", "Notes for the next edit" and "Section sample" so they are about my business: [2-3 lines]. Delete any that have no sensible equivalent. Keep the YAML valid and the other sections unchanged. Show me the diff.',
  },
  privacy: {
    help: "The privacy policy is a placeholder. Replace it with a real policy, then confirm someone reviewed it.",
    steps: [
      "Get a policy: from a generator (Termly, iubenda or similar), your lawyer, or ask Claude Chat to draft one. Tell it what the site collects: Google Analytics (if set up), the contact email, any forms or newsletter.",
      "Save it as privacy.md, open Claude Chat, attach it and paste the prompt below.",
      "Re-scan. The item turns to Review: read the live /privacy/ page, then tick \"I confirm the new content was reviewed\".",
      "Not legal advice: if the site collects personal data from people in the EU or California, have a lawyer read it.",
    ],
    prompt:
      'In my site repo [owner/repo], replace the policy text in site/src/content/pages/privacy.yaml with the attached privacy.md, keeping the YAML structure and keys. Update the meta description to match. The word "placeholder" must not appear anywhere in the file. Commit and push to main.',
  },
  terms: {
    help: "The terms of use are a placeholder. Replace them with real terms, then confirm someone reviewed them.",
    steps: [
      "Get terms: from a generator, your lawyer, or ask Claude Chat to draft plain-language terms for this site.",
      "Save them as terms.md, open Claude Chat, attach it and paste the prompt below.",
      "Re-scan. The item turns to Review: read the live /terms/ page, then tick \"I confirm the new content was reviewed\".",
    ],
    prompt:
      'In my site repo [owner/repo], replace the terms text in site/src/content/pages/terms.yaml with the attached terms.md, keeping the YAML structure and keys. Update the meta description to match. The word "placeholder" must not appear anywhere in the file. Commit and push to main.',
  },
  testimonials: {
    help: "The testimonials are fake layout quotes. Publishing invented testimonials is a legal risk: replace them or remove them.",
    steps: [
      "Decide: do you have real quotes with the person's name, role, company and permission to publish?",
      "Yes: paste prompt A below into Claude Chat with the quotes filled in.",
      "No (most new sites): paste prompt B below into Claude Chat. It removes the page and the homepage block.",
      "Re-scan. If you kept testimonials, tick \"I confirm the new content was reviewed\" once you have checked the live page.",
    ],
    prompt:
      'A (real quotes): In my site repo [owner/repo], replace every quote in site/src/content/pages/testimonials.yaml and in the testimonials section of site/src/content/pages/home.yaml with these: [quote — name, role, company; one per line]. Remove any "Role to be confirmed". Commit and push to main.\n\nB (no quotes): In my site repo [owner/repo], delete site/src/content/pages/testimonials.yaml, remove the testimonials section from site/src/content/pages/home.yaml, and remove every link to /testimonials/ anywhere under site/. Run npm run build in site/ to confirm nothing breaks. Commit and push to main.',
  },
  author: {
    help: "The author profile still has [PLACEHOLDER] name, role and bio. Every article shows this person as writer.",
    steps: [
      "Gather: full name, role and company, a 3–4 sentence bio (why readers should trust them on this subject), credentials, topics they know, their LinkedIn URL, and a square headshot (at least 400×400) named author.jpg.",
      "Open Claude Chat, attach author.jpg and paste the prompt below with the details filled in. It also renames the file (the Author file name item).",
      "Check the author page on the Vercel preview, then click Re-scan.",
    ],
    prompt:
      'In my site repo [owner/repo]: rename site/src/content/team/site-author.md to [jane-doe].md (the author\'s name as a lowercase-hyphen slug). Fill its frontmatter — name, role, bio, credentials (list), knowsAbout (list), sameAs (list of profile URLs) — from: [details]. Save the attached photo as site/src/assets/team/[jane-doe].jpg, set photo: to "../../assets/team/[jane-doe].jpg" and delete site/src/assets/team/site-author.png. In every file in site/src/content/articles/, change author: "site-author" to author: "[jane-doe]". No "[PLACEHOLDER" may remain. Run npm run build in site/, then commit and push to main.',
  },
  "author-slug": {
    help: "The author file is still called site-author.md, so the author page lives at /team/site-author/.",
    steps: [
      "If you used the Author profile prompt, this is already done — click Re-scan.",
      "Otherwise paste the prompt below into Claude Chat or Cursor with the author's slug (e.g. jane-doe).",
      PUSH,
    ],
    prompt:
      'Rename site/src/content/team/site-author.md to [jane-doe].md. In every file in site/src/content/articles/, change author: "site-author" to author: "[jane-doe]". Search site/ for any other "site-author" reference and update it. Run npm run build in site/ to confirm nothing breaks. Show me the changes.',
  },
  services: {
    help: "The services section has one placeholder service. Replace it with the site's real offers.",
    steps: [
      "For each service, write: name, who it is for, what they get (3–5 bullets), and what an engagement looks like.",
      "Open Claude Chat and paste the prompt below with your services filled in. Each service becomes one page under /services/.",
      "Check the services pages on the Vercel preview, then click Re-scan.",
    ],
    prompt:
      "In my site repo [owner/repo], delete site/src/content/services/content-systems.md and create one .md per service below in the same folder. Use the same frontmatter fields as the deleted file: title, description (140-160 characters), order (1, 2, 3…), icon (pick a fitting icon name of the kind the template already uses). Body: 2-4 short paragraphs from my notes. Services: [paste]. Run npm run build in site/, then commit and push to main.",
  },
  "demo-articles": {
    help: "The four SEO demo articles from the template are still published.",
    steps: [
      "Wait until at least one of your own articles is live, or the Articles page will be empty.",
      "Paste the prompt below into Claude Chat or Cursor. It deletes the articles and their images, which also clears those files from the Logo, favicon… item.",
      PUSH,
    ],
    prompt:
      "Delete these four files in site/src/content/articles/: content-strategy-foundations.md, core-web-vitals-complete-guide.md, improve-core-web-vitals-howto.md, technical-seo-foundations.md — and the images with the same names (.png) in site/src/assets/articles/. Search site/ for links to those four slugs and remove them. Run npm run build in site/ to confirm nothing breaks. Show me the changes.",
  },
};
