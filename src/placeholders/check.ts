import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import type { PlaceholderCheck, PlaceholderLevel, PlaceholderManifest } from "./manifest";
import { BLUEPRINT_PLACEHOLDERS } from "./manifest";

/**
 * Read access to one site, rooted at the site folder. Implement it over the
 * local disk (`localSiteFiles`) or over the GitHub API (one recursive tree call
 * for `list`, a blob or contents call for `read`).
 */
export interface SiteFiles {
  /** Every file path under the site root, "/"-separated, relative to it. */
  list(): string[] | Promise<string[]>;
  /** File bytes, or null when the file does not exist. */
  read(path: string): Uint8Array | string | null | Promise<Uint8Array | string | null>;
}

/**
 * - placeholder: the template's text, value or file is still there.
 * - replaced: it is gone.
 * - review: it is gone, and a person still has to confirm the new content.
 * - unknown: the check could not run (expected file or setting missing).
 */
export type PlaceholderStatus = "placeholder" | "replaced" | "review" | "unknown";

export interface PlaceholderFinding {
  file: string;
  line?: number;
  detail: string;
}

export interface PlaceholderResult {
  id: string;
  label: string;
  group: string;
  level: PlaceholderLevel;
  review: boolean;
  help?: string;
  steps?: string[];
  prompt?: string;
  status: PlaceholderStatus;
  findings: PlaceholderFinding[];
}

export interface PlaceholderCounts {
  total: number;
  placeholder: number;
  replaced: number;
  review: number;
  unknown: number;
}

export interface PlaceholderReport {
  template: string;
  manifestVersion: number;
  results: PlaceholderResult[];
  required: PlaceholderCounts;
  suggested: PlaceholderCounts;
  /** No required check is still a placeholder or unknown. "review" items still need a person. */
  clear: boolean;
}

const MAX_FINDINGS = 50;
const MAX_DETAIL = 140;
const SKIP_DIRS = new Set(["node_modules", "dist", ".astro", ".git", ".vercel", ".cache"]);

/** Glob → RegExp over "/"-separated paths. Supports `**`, `*` and `?`. */
export function globToRegExp(glob: string): RegExp {
  let out = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*" && glob[i + 1] === "*") {
      if (glob[i + 2] === "/") {
        out += "(?:.*/)?";
        i += 2;
      } else {
        out += ".*";
        i += 1;
      }
    } else if (c === "*") out += "[^/]*";
    else if (c === "?") out += "[^/]";
    else out += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${out}$`);
}

function asList(value: string | string[]): string[] {
  return Array.isArray(value) ? value : [value];
}

function matchFiles(all: string[], patterns: string | string[], exclude: string[] = []): string[] {
  const include = asList(patterns).map(globToRegExp);
  const skip = exclude.map(globToRegExp);
  return all.filter((path) => include.some((re) => re.test(path)) && !skip.some((re) => re.test(path))).sort();
}

function toText(content: Uint8Array | string): string {
  return typeof content === "string" ? content : Buffer.from(content).toString("utf8");
}

function clip(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > MAX_DETAIL ? `${flat.slice(0, MAX_DETAIL - 1)}…` : flat;
}

function lineAt(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

async function readText(files: SiteFiles, path: string): Promise<string | null> {
  const content = await files.read(path);
  return content === null ? null : toText(content);
}

/** SHA-256 hex of a file; SVG line endings normalized to LF (matches the blueprint audit). */
export function templateFileHash(path: string, content: Uint8Array | string): string {
  const bytes = typeof content === "string" ? Buffer.from(content, "utf8") : Buffer.from(content);
  const data = path.toLowerCase().endsWith(".svg") ? Buffer.from(bytes.toString("utf8").replace(/\r\n/g, "\n")) : bytes;
  return createHash("sha256").update(data).digest("hex");
}

/**
 * Lines of `image:` briefs in a YAML document that have no `src:` key in the
 * same mapping. Line-based on purpose (no YAML dependency): block-scalar text
 * only counts when a line sits exactly at a key's column.
 */
export function findImageBriefsWithoutSrc(yaml: string): { line: number; brief: string }[] {
  const lines = yaml.split(/\r?\n/);
  const out: { line: number; brief: string }[] = [];
  const keyAt = (line: string): { col: number; key: string; dash: boolean } | null => {
    const m = line.match(/^(\s*)(-\s+)?([A-Za-z0-9_-]+):(?:\s|$)/);
    if (!m) return null;
    return { col: m[1].length + (m[2] ? m[2].length : 0), key: m[3], dash: Boolean(m[2]) };
  };
  const indentOf = (line: string) => (line.match(/^\s*/)?.[0].length ?? 0);
  const blank = (line: string) => /^\s*(#.*)?$/.test(line);

  lines.forEach((line, i) => {
    const key = keyAt(line);
    if (!key || key.key !== "image") return;
    const brief = line.replace(/^\s*(-\s+)?image:\s*/, "").trim();
    if (!brief || brief === "|" || brief === ">") return;
    const col = key.col;
    let hasSrc = false;

    // Up: siblings above, through this item's "- " line.
    if (!key.dash) {
      for (let j = i - 1; j >= 0; j--) {
        const l = lines[j];
        if (blank(l)) continue;
        const k = keyAt(l);
        if (k && k.col === col && k.key === "src") hasSrc = true;
        if (k && k.dash && k.col === col) break;
        if (indentOf(l) < col) break;
      }
    }
    // Down: siblings below, until the next item or a shallower line.
    for (let j = i + 1; j < lines.length && !hasSrc; j++) {
      const l = lines[j];
      if (blank(l)) continue;
      const k = keyAt(l);
      if (k && k.dash && k.col <= col) break;
      if (!k?.dash && indentOf(l) < col) break;
      if (k && k.col === col && k.key === "src") hasSrc = true;
    }
    if (!hasSrc) out.push({ line: i + 1, brief });
  });
  return out;
}

async function runCheck(check: PlaceholderCheck, files: SiteFiles, all: string[]): Promise<{ status: PlaceholderStatus; findings: PlaceholderFinding[] }> {
  const findings: PlaceholderFinding[] = [];
  const add = (finding: PlaceholderFinding) => {
    if (findings.length < MAX_FINDINGS) findings.push(finding);
  };

  switch (check.kind) {
    case "markers": {
      const matched = matchFiles(all, check.files, check.exclude);
      if (!matched.length) {
        const status = check.missing ?? "unknown";
        return { status, findings: status === "unknown" ? [{ file: asList(check.files).join(", "), detail: "File not found" }] : [] };
      }
      let hits = 0;
      for (const path of matched) {
        const text = await readText(files, path);
        if (text === null) continue;
        const seen = new Set<number>();
        for (const marker of check.markers) {
          let from = 0;
          for (;;) {
            const at = text.indexOf(marker, from);
            if (at < 0) break;
            from = at + marker.length;
            const line = lineAt(text, at);
            if (seen.has(line)) continue;
            seen.add(line);
            hits++;
            add({ file: path, line, detail: clip(text.split(/\r?\n/)[line - 1] ?? marker) });
          }
        }
      }
      findings.sort((a, b) => a.file.localeCompare(b.file) || (a.line ?? 0) - (b.line ?? 0));
      return { status: hits ? "placeholder" : "replaced", findings };
    }

    case "value": {
      const text = all.includes(check.file) ? await readText(files, check.file) : null;
      if (text === null) return { status: "unknown", findings: [{ file: check.file, detail: "File not found" }] };
      let matchedAny = false;
      for (const source of check.patterns) {
        const m = new RegExp(source, "m").exec(text);
        if (!m) continue;
        matchedAny = true;
        const value = (m[1] ?? "").trim();
        if (check.placeholders.includes(value)) {
          add({ file: check.file, line: lineAt(text, m.index), detail: value ? `Still "${clip(value)}"` : "Empty" });
        }
      }
      if (!matchedAny) return { status: "unknown", findings: [{ file: check.file, detail: "Setting not found" }] };
      return { status: findings.length ? "placeholder" : "replaced", findings };
    }

    case "exists": {
      for (const path of matchFiles(all, check.files)) add({ file: path, detail: "Template file still present" });
      return { status: findings.length ? "placeholder" : "replaced", findings };
    }

    case "originals": {
      const raw = all.includes(check.hashes) ? await readText(files, check.hashes) : null;
      if (raw === null) return { status: "unknown", findings: [{ file: check.hashes, detail: "Template hash list not found" }] };
      let originals: Record<string, string>;
      try {
        originals = JSON.parse(raw);
      } catch {
        return { status: "unknown", findings: [{ file: check.hashes, detail: "Template hash list is not valid JSON" }] };
      }
      const byHash = new Map(Object.entries(originals).map(([path, hash]) => [String(hash).toLowerCase(), path]));
      const inDirs = all.filter((path) => check.dirs.some((dir) => path.startsWith(`${dir.replace(/\/+$/, "")}/`))).sort();
      for (const path of inDirs) {
        const content = await files.read(path);
        if (content === null) continue;
        const original = byHash.get(templateFileHash(path, content));
        if (original) add({ file: path, detail: original === path ? "Template original" : `Copy of the template's ${original}` });
      }
      return { status: findings.length ? "placeholder" : "replaced", findings };
    }

    case "imageBriefs": {
      for (const path of matchFiles(all, check.files)) {
        const text = await readText(files, path);
        if (text === null) continue;
        for (const { line, brief } of findImageBriefsWithoutSrc(text)) add({ file: path, line, detail: clip(brief) });
      }
      return { status: findings.length ? "placeholder" : "replaced", findings };
    }
  }
}

function count(results: PlaceholderResult[]): PlaceholderCounts {
  const c: PlaceholderCounts = { total: results.length, placeholder: 0, replaced: 0, review: 0, unknown: 0 };
  for (const r of results) c[r.status]++;
  return c;
}

/**
 * Run a placeholder manifest against one site. Works on any `SiteFiles`
 * source, so the build, a CLI and TNV (over GitHub) report the same thing.
 */
export async function checkPlaceholders(
  files: SiteFiles,
  manifest: PlaceholderManifest = BLUEPRINT_PLACEHOLDERS,
): Promise<PlaceholderReport> {
  const all = (await files.list()).map((path) => path.replace(/\\/g, "/").replace(/^\.?\/+/, ""));
  const results: PlaceholderResult[] = [];
  for (const check of manifest.checks) {
    let outcome: { status: PlaceholderStatus; findings: PlaceholderFinding[] };
    try {
      outcome = await runCheck(check, files, all);
    } catch (err) {
      outcome = { status: "unknown", findings: [{ file: "", detail: `Check failed: ${clip(String((err as Error)?.message ?? err))}` }] };
    }
    const review = Boolean(check.review);
    results.push({
      id: check.id,
      label: check.label,
      group: check.group,
      level: check.level ?? "required",
      review,
      ...(check.help ? { help: check.help } : {}),
      ...(check.steps?.length ? { steps: check.steps } : {}),
      ...(check.prompt ? { prompt: check.prompt } : {}),
      status: outcome.status === "replaced" && review ? "review" : outcome.status,
      findings: outcome.findings,
    });
  }
  const required = count(results.filter((r) => r.level === "required"));
  const suggested = count(results.filter((r) => r.level === "suggested"));
  return {
    template: manifest.template,
    manifestVersion: manifest.version,
    results,
    required,
    suggested,
    clear: required.placeholder === 0 && required.unknown === 0,
  };
}

/** `SiteFiles` over a local folder (skips node_modules, dist, .astro, .git). */
export function localSiteFiles(root: string): SiteFiles {
  return {
    list() {
      const out: string[] = [];
      const walk = (dir: string) => {
        if (!existsSync(dir)) return;
        for (const name of readdirSync(dir)) {
          if (SKIP_DIRS.has(name)) continue;
          const full = join(dir, name);
          if (statSync(full).isDirectory()) walk(full);
          else out.push(relative(root, full).replace(/\\/g, "/"));
        }
      };
      walk(root);
      return out;
    },
    read(path) {
      const full = join(root, path);
      return existsSync(full) ? readFileSync(full) : null;
    },
  };
}
