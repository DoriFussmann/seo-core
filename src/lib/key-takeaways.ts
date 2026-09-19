import { SKIP, visit } from "unist-util-visit";

const HEADING = "Key Takeaways";

function textOf(node: { type?: string; value?: string; children?: unknown[] }): string {
  if (node.type === "text" && typeof node.value === "string") return node.value;
  if (!Array.isArray(node.children)) return "";
  return node.children.map((child) => textOf(child as { type?: string; value?: string; children?: unknown[] })).join("");
}

function classList(node: { properties?: Record<string, unknown> } | undefined): string[] {
  const raw = node?.properties?.className ?? node?.properties?.class;
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === "string") return raw.split(/\s+/);
  return [];
}

/** Wrap "## Key Takeaways" and its following list in an accessible aside. */
export function rehypeKeyTakeaways() {
  return (tree: { children?: unknown[] }) => {
    visit(tree as never, (node: Record<string, unknown>, index: number | undefined, parent: { children: unknown[]; tagName?: string; properties?: Record<string, unknown> } | undefined) => {
      if (index == null || !parent) return;
      if (classList(parent).includes("key-takeaways")) return SKIP;
      if (node.type !== "element" || node.tagName !== "h2") return;
      if (textOf(node as { type?: string; value?: string; children?: unknown[] }) !== HEADING) return;

      const properties = (node.properties as Record<string, unknown> | undefined) || {};
      properties.id = "key-takeaways";
      node.properties = properties;

      let end = index + 1;
      const siblings = parent.children;
      while (end < siblings.length) {
        const sib = siblings[end] as { type?: string; value?: string; tagName?: string };
        if (sib.type === "text" && typeof sib.value === "string" && !sib.value.trim()) {
          end += 1;
          continue;
        }
        if (sib.type === "element" && (sib.tagName === "ul" || sib.tagName === "ol")) {
          end += 1;
        }
        break;
      }

      const aside = {
        type: "element",
        tagName: "aside",
        properties: {
          className: ["key-takeaways"],
          "aria-labelledby": "key-takeaways",
        },
        children: siblings.slice(index, end),
      };

      siblings.splice(index, end - index, aside);
      return [SKIP, index + 1];
    });
  };
}
