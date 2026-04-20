import type {
  AnyNode,
  Element as DomElement,
  Text as DomText,
} from "domhandler";
import { parseDocument } from "htmlparser2";

import { parseInlineStyle } from "./parseInlineStyle.js";
import type { ParsedDomNode } from "./types.js";

export function parseHtmlRoot(html: string): ParsedDomNode | null {
  const doc = parseDocument(html);
  const rootElement = (doc.children as AnyNode[]).find(isElement);
  if (!rootElement) return null;
  return toParsedNode(rootElement, "root");
}

function toParsedNode(el: DomElement, path: string): ParsedDomNode {
  const attrs: Record<string, string> = {};
  const rawAttribs = el.attribs ?? {};
  for (const key of Object.keys(rawAttribs)) {
    attrs[key.toLowerCase()] = rawAttribs[key] ?? "";
  }
  const style = parseInlineStyle(attrs.style);
  const children: ParsedDomNode[] = [];
  let textAcc = "";
  const rawChildren = (el.children ?? []) as AnyNode[];
  for (let i = 0; i < rawChildren.length; i++) {
    const child = rawChildren[i];
    if (!child) continue;
    if (isElement(child)) {
      children.push(toParsedNode(child, `${path}.children[${i}]`));
    } else if (isText(child)) {
      textAcc += child.data ?? "";
    }
  }
  return {
    tag: (el.name ?? "").toLowerCase(),
    attrs: Object.freeze(attrs),
    style,
    text: collapseWhitespace(textAcc),
    children,
    path,
  };
}

function collapseWhitespace(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

function isElement(node: AnyNode): node is DomElement {
  return (node as DomElement).type === "tag";
}

function isText(node: AnyNode): node is DomText {
  return (node as DomText).type === "text";
}
