import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** This package's version. Kept equal to package.json (a test enforces it). */
export const SEO_CORE_VERSION = "1.3.0";

const MARKER = "seo-core-version";
const DATA_STORE = "data-store.json";

/**
 * Astro caches parsed content entries in `<cacheDir>/data-store.json` and
 * reuses them while the content files and the content config file are
 * unchanged — including on hosts that keep the build cache between deploys.
 * Entries parsed with an older seo-core schema would keep its defaults and
 * transforms. This deletes that cache once whenever the seo-core version
 * differs from the one that wrote it. Returns true when a cache was cleared.
 */
export function resetContentCacheOnUpgrade(cacheDir: string): boolean {
  const marker = join(cacheDir, MARKER);
  const previous = existsSync(marker) ? readFileSync(marker, "utf8").trim() : null;
  if (previous === SEO_CORE_VERSION) return false;
  const store = join(cacheDir, DATA_STORE);
  const cleared = existsSync(store);
  if (cleared) rmSync(store, { force: true });
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(marker, `${SEO_CORE_VERSION}\n`, "utf8");
  return cleared;
}
