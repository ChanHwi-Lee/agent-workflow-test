import { parseDocument } from "htmlparser2";
import type {
  AnyNode,
  Element as DomElement,
  Document as DomDocument,
} from "domhandler";

export type HtmlValidationCode =
  | "root_not_found"
  | "root_shape_mismatch"
  | "forbidden_tag"
  | "child_count_out_of_range"
  | "child_missing_absolute_position"
  | "forbidden_css_pattern";

export interface HtmlValidationIssue {
  readonly code: HtmlValidationCode;
  readonly severity: "error" | "warning";
  readonly message: string;
  readonly path?: string;
}

export interface HtmlValidationResult {
  readonly ok: boolean;
  readonly issues: HtmlValidationIssue[];
  readonly childCount: number;
  readonly rootFound: boolean;
}

const ALLOWED_CHILD_TAGS = new Set([
  "div",
  "span",
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "img",
  "svg",
]);

const FORBIDDEN_TAGS = new Set([
  "br",
  "a",
  "button",
  "ul",
  "ol",
  "li",
  "table",
  "form",
  "input",
  "style",
  "script",
  "link",
  "meta",
  "html",
  "head",
  "body",
]);

const FORBIDDEN_CSS_PATTERNS: Array<{
  pattern: RegExp;
  label: string;
}> = [
  { pattern: /\bdisplay\s*:\s*flex\b/i, label: "display:flex" },
  { pattern: /\bdisplay\s*:\s*inline-flex\b/i, label: "display:inline-flex" },
  { pattern: /\bdisplay\s*:\s*grid\b/i, label: "display:grid" },
  { pattern: /\bcalc\(/i, label: "calc(" },
  { pattern: /\btranslate[XY]?\s*\(/i, label: "translate(" },
  {
    pattern: /\btransform\s*:[^;]*translate/i,
    label: "transform:translate",
  },
  { pattern: /\bposition\s*:\s*fixed\b/i, label: "position:fixed" },
  { pattern: /\bposition\s*:\s*sticky\b/i, label: "position:sticky" },
];

const ROOT_STYLE_REQUIREMENTS: Array<{ key: string; value: string }> = [
  { key: "position", value: "relative" },
  { key: "width", value: "1200px" },
  { key: "height", value: "628px" },
];

export function validateMethodBHtml(html: string): HtmlValidationResult {
  const issues: HtmlValidationIssue[] = [];
  const root = findRootElement(html);
  if (!root) {
    issues.push({
      code: "root_not_found",
      severity: "error",
      message:
        "no root <div style=\"position:relative; width:1200px; height:628px; ...\"> element found",
    });
    return { ok: false, issues, childCount: 0, rootFound: false };
  }

  const rootStyle = parseStyleAttr(root.attribs?.style ?? "");
  for (const requirement of ROOT_STYLE_REQUIREMENTS) {
    const actual = rootStyle[requirement.key];
    if (actual !== requirement.value) {
      issues.push({
        code: "root_shape_mismatch",
        severity: "error",
        message: `root style ${requirement.key}=${actual ?? "(missing)"} does not match required ${requirement.value}`,
      });
    }
  }

  const descendants = collectElementDescendants(root);
  const directChildren = (root.children ?? []).filter(isElement);

  for (const el of descendants) {
    const tag = (el.name ?? "").toLowerCase();
    if (FORBIDDEN_TAGS.has(tag)) {
      issues.push({
        code: "forbidden_tag",
        severity: "error",
        message: `forbidden tag <${tag}> encountered`,
        path: describeNodePath(el, root),
      });
      continue;
    }
    if (!ALLOWED_CHILD_TAGS.has(tag) && tag !== "") {
      issues.push({
        code: "forbidden_tag",
        severity: "error",
        message: `tag <${tag}> is not on the allowed child tag whitelist`,
        path: describeNodePath(el, root),
      });
      continue;
    }

    const style = el.attribs?.style ?? "";
    if (style) {
      for (const forbidden of FORBIDDEN_CSS_PATTERNS) {
        if (forbidden.pattern.test(style)) {
          issues.push({
            code: "forbidden_css_pattern",
            severity: "error",
            message: `forbidden CSS pattern "${forbidden.label}" in <${tag}> inline style`,
            path: describeNodePath(el, root),
          });
        }
      }
      const parsed = parseStyleAttr(style);
      if (parsed.position !== "absolute") {
        issues.push({
          code: "child_missing_absolute_position",
          severity: "error",
          message: `<${tag}> is missing position:absolute`,
          path: describeNodePath(el, root),
        });
      }
    } else {
      issues.push({
        code: "child_missing_absolute_position",
        severity: "error",
        message: `<${tag}> has no inline style attribute`,
        path: describeNodePath(el, root),
      });
    }
  }

  const childCount = directChildren.length;
  if (childCount < 3 || childCount > 12) {
    issues.push({
      code: "child_count_out_of_range",
      severity: "warning",
      message: `root has ${childCount} direct children (expected 3–12)`,
    });
  }

  const hasError = issues.some((i) => i.severity === "error");
  return {
    ok: !hasError,
    issues,
    childCount,
    rootFound: true,
  };
}

function findRootElement(html: string): DomElement | null {
  const doc = parseDocument(html) as DomDocument;
  const root = (doc.children as AnyNode[]).find(isElement);
  return root ?? null;
}

function collectElementDescendants(root: DomElement): DomElement[] {
  const out: DomElement[] = [];
  const stack: AnyNode[] = [...((root.children ?? []) as AnyNode[])];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) continue;
    if (isElement(node)) {
      out.push(node);
      if (node.children) {
        for (const child of node.children as AnyNode[]) {
          stack.push(child);
        }
      }
    }
  }
  return out;
}

function parseStyleAttr(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw) return out;
  let depth = 0;
  let buf = "";
  const decls: string[] = [];
  for (const ch of raw) {
    if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    if (ch === ";" && depth === 0) {
      if (buf.trim()) decls.push(buf);
      buf = "";
      continue;
    }
    buf += ch;
  }
  if (buf.trim()) decls.push(buf);
  for (const decl of decls) {
    const colonIdx = decl.indexOf(":");
    if (colonIdx === -1) continue;
    const key = decl.slice(0, colonIdx).trim().toLowerCase();
    const value = decl.slice(colonIdx + 1).trim();
    if (!key || !value) continue;
    out[key] = value;
  }
  return out;
}

function isElement(node: AnyNode): node is DomElement {
  return (node as DomElement).type === "tag";
}

function describeNodePath(el: DomElement, root: DomElement): string {
  const path: string[] = [];
  let current: AnyNode | null = el;
  while (current && current !== root) {
    if (isElement(current)) {
      path.unshift(current.name ?? "?");
    }
    current = (current as DomElement).parent ?? null;
  }
  return path.length > 0 ? path.join(">") : "(root child)";
}
