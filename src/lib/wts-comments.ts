import { visit } from "unist-util-visit";

export const WTS_START = "<!-- WHERE-THINGS-STAND:START -->";
export const WTS_END = "<!-- WHERE-THINGS-STAND:END -->";

const START_INNER = " WHERE-THINGS-STAND:START ";
const END_INNER = " WHERE-THINGS-STAND:END ";
const MARKER_RE = /<!--\s*WHERE-THINGS-STAND:(START|END)\s*-->/g;

function commentNode(which: "START" | "END") {
  return { type: "comment", value: which === "START" ? START_INNER : END_INNER };
}

function splitByMarkers(value: string, asRaw: boolean) {
  const nodes: object[] = [];
  let last = 0;
  MARKER_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = MARKER_RE.exec(value))) {
    if (match.index > last) {
      const chunk = value.slice(last, match.index);
      nodes.push(asRaw ? { type: "raw", value: chunk } : { type: "text", value: chunk });
    }
    nodes.push(commentNode(match[1] as "START" | "END"));
    last = match.index + match[0].length;
  }
  if (last < value.length) {
    const chunk = value.slice(last);
    nodes.push(asRaw ? { type: "raw", value: chunk } : { type: "text", value: chunk });
  }
  return nodes;
}

/** Keep WTS HTML comments as html nodes so rehype can emit them verbatim. */
export function remarkPreserveWts() {
  return (tree: { children?: unknown[] }) => {
    visit(tree as never, "html", (node: { value?: string; data?: Record<string, unknown> }) => {
      if (typeof node.value === "string" && node.value.includes("WHERE-THINGS-STAND")) {
        node.data = node.data || {};
        node.data.hName = "span";
        node.data.hProperties = {
          "data-wts": node.value.includes("START") ? "start" : "end",
        };
      }
    });
  };
}

/** Emit real HTML comments for TNV scanners. */
export function rehypeEmitWtsComments() {
  return (tree: { children?: unknown[] }) => {
    visit(tree as never, (node: Record<string, unknown>, index: number | undefined, parent: { children: unknown[] } | undefined) => {
      if (index == null || !parent) return;

      if (node.type === "element" && (node.properties as { "data-wts"?: string } | undefined)?.["data-wts"]) {
        const which = (node.properties as { "data-wts": string })["data-wts"] === "start" ? "START" : "END";
        parent.children.splice(index, 1, commentNode(which));
        return index;
      }

      if (node.type === "comment" && typeof node.value === "string") {
        if (/WHERE-THINGS-STAND:START/.test(node.value)) node.value = START_INNER;
        if (/WHERE-THINGS-STAND:END/.test(node.value)) node.value = END_INNER;
        return;
      }

      if (
        (node.type === "raw" || node.type === "text") &&
        typeof node.value === "string" &&
        /WHERE-THINGS-STAND/.test(node.value)
      ) {
        const nodes = splitByMarkers(node.value, node.type === "raw");
        if (nodes.length) parent.children.splice(index, 1, ...nodes);
        return index;
      }
    });
  };
}
