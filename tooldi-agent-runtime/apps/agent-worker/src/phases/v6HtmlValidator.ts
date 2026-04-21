// AGW v6 HTML validator — security-only.
//
// v5 의 grammar 강제 (3-12 child, integer px, nested 금지, position:absolute 강제,
// flex/grid/calc/translate 금지 등) 은 전부 폐기. v6 는 브라우저가 layout 을
// 계산하므로 LLM HTML 에 grammar 제약을 가하지 않는다.
//
// 이 validator 는 오직 browser rendering 에서 실제 보안 위험이 있는 요소만
// 차단한다:
//   - <script> 실행, <style>/<link> CSS 주입, <meta> 리디렉션
//   - <form>/<input> 상호작용
//   - <iframe>/<canvas>/<video>/<audio>/<object>/<embed> 외부 리소스 로드
//   - on* event handler attribute
//   - CSS animation / transition / pseudo-class / pseudo-element
//     (Chromium 렌더 시점에 비결정성 유발)
//
// Root 는 `<div>` 여야 한다 (그 외는 mapper 가 extract 결과를 평면화할 때
// 예측 가능한 entry point 가 없음).

import { parseDocument } from "htmlparser2";
import type {
  AnyNode,
  Element as DomElement,
  Document as DomDocument,
} from "domhandler";

export type V6HtmlValidationCode =
  | "root_not_found"
  | "root_not_div"
  | "forbidden_tag"
  | "forbidden_event_attr"
  | "forbidden_css_pattern";

export interface V6HtmlValidationIssue {
  readonly code: V6HtmlValidationCode;
  readonly severity: "error" | "warning";
  readonly message: string;
  readonly path?: string;
}

export interface V6HtmlValidationResult {
  readonly ok: boolean;
  readonly issues: ReadonlyArray<V6HtmlValidationIssue>;
}

const FORBIDDEN_TAGS = new Set([
  "script",
  "style",
  "link",
  "meta",
  "form",
  "input",
  "textarea",
  "select",
  "iframe",
  "canvas",
  "video",
  "audio",
  "object",
  "embed",
  "base",
]);

const FORBIDDEN_EVENT_ATTR_RE = /^on[a-z]+$/i;

const FORBIDDEN_CSS_PATTERNS: ReadonlyArray<{
  readonly pattern: RegExp;
  readonly label: string;
}> = [
  { pattern: /\banimation\b/i, label: "animation" },
  { pattern: /\btransition\b/i, label: "transition" },
  { pattern: /@keyframes\b/i, label: "@keyframes" },
  { pattern: /::(before|after|placeholder|selection)\b/i, label: "pseudo-element" },
  { pattern: /:(hover|focus|active|visited|checked|disabled)\b/i, label: "pseudo-class" },
];

export function validateV6Html(html: string): V6HtmlValidationResult {
  const issues: V6HtmlValidationIssue[] = [];
  const doc = parseDocument(html);
  const root = findRootElement(doc);
  if (!root) {
    issues.push({
      code: "root_not_found",
      severity: "error",
      message: "no root element found",
    });
    return { ok: false, issues };
  }
  if (root.tagName.toLowerCase() !== "div") {
    issues.push({
      code: "root_not_div",
      severity: "error",
      message: `root element must be <div>, got <${root.tagName}>`,
      path: "0",
    });
  }

  walk(root, "0", issues);

  const ok = issues.every((i) => i.severity !== "error");
  return { ok, issues };
}

function walk(
  node: DomElement,
  path: string,
  issues: V6HtmlValidationIssue[],
): void {
  const tag = node.tagName.toLowerCase();
  if (FORBIDDEN_TAGS.has(tag)) {
    issues.push({
      code: "forbidden_tag",
      severity: "error",
      message: `forbidden tag <${tag}>`,
      path,
    });
    // Still walk children so downstream messages can surface, but the
    // overall validation already fails.
  }

  const attribs = node.attribs ?? {};
  for (const attrName of Object.keys(attribs)) {
    if (FORBIDDEN_EVENT_ATTR_RE.test(attrName)) {
      issues.push({
        code: "forbidden_event_attr",
        severity: "error",
        message: `forbidden event handler attribute \`${attrName}\``,
        path,
      });
    }
  }

  const styleAttr = attribs.style;
  if (styleAttr) {
    for (const rule of FORBIDDEN_CSS_PATTERNS) {
      if (rule.pattern.test(styleAttr)) {
        issues.push({
          code: "forbidden_css_pattern",
          severity: "error",
          message: `forbidden CSS: ${rule.label}`,
          path,
        });
      }
    }
  }

  let childIdx = 0;
  for (const child of node.children as AnyNode[]) {
    if (child.type === "tag" || child.type === "script" || child.type === "style") {
      walk(child as DomElement, `${path}.${childIdx}`, issues);
      childIdx += 1;
    }
  }
}

function findRootElement(doc: DomDocument): DomElement | null {
  for (const node of doc.children as AnyNode[]) {
    if (node.type === "tag" || node.type === "script" || node.type === "style") {
      return node as DomElement;
    }
  }
  return null;
}
