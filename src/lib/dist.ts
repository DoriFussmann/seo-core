import { existsSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/** Every .html file under `dir`, recursively. */
export function walkHtml(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walkHtml(full, acc);
    else if (name.endsWith(".html")) acc.push(full);
  }
  return acc;
}

/** dist-relative POSIX path ("articles/x/index.html"). */
export function distRelative(distDir: string, file: string): string {
  return relative(distDir, file).replace(/\\/g, "/");
}

/** URL pathname a built file serves ("articles/x/index.html" → "/articles/x/"). */
export function pagePathname(rel: string): string {
  if (rel === "index.html" || rel === "") return "/";
  const withoutFile = rel.replace(/index\.html$/, "");
  const withSlash = withoutFile.endsWith("/") ? withoutFile : `${withoutFile}/`;
  return `/${withSlash.replace(/^\/+/, "")}`;
}
