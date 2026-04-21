import assert from "node:assert/strict";
import test from "node:test";

import { validateV6Html } from "./v6HtmlValidator.js";

test("validateV6Html — passes free HTML without grammar constraints", () => {
  // Flex, grid, calc, nested wrappers, transform, <h1>, <p>, <img>, inline <svg>
  // 전부 v5 에서는 거부됐지만 v6 는 모두 허용.
  const html = `<div style="width:1200px;height:628px;display:flex;justify-content:center;">
    <div style="padding:32px;transform:rotate(2deg);background:linear-gradient(135deg,#fff,#eee);">
      <h1>Title</h1>
      <p>body</p>
      <img src="placeholder://hero.png" style="width:200px;height:200px"/>
      <svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>
    </div>
  </div>`;
  const result = validateV6Html(html);
  assert.equal(result.ok, true, JSON.stringify(result.issues));
  assert.equal(result.issues.length, 0);
});

test("validateV6Html — rejects <script>", () => {
  const html = `<div><script>alert(1)</script></div>`;
  const result = validateV6Html(html);
  assert.equal(result.ok, false);
  assert.ok(
    result.issues.some(
      (i) => i.code === "forbidden_tag" && i.message.includes("<script>"),
    ),
  );
});

test("validateV6Html — rejects <style> and <link>", () => {
  for (const tag of ["style", "link", "meta"]) {
    const html = `<div><${tag}/></div>`;
    const result = validateV6Html(html);
    assert.equal(result.ok, false, `should reject <${tag}>`);
    assert.ok(
      result.issues.some(
        (i) => i.code === "forbidden_tag" && i.message.includes(`<${tag}>`),
      ),
      `expected forbidden_tag for <${tag}>`,
    );
  }
});

test("validateV6Html — rejects interactive + embedded content tags", () => {
  for (const tag of [
    "form",
    "input",
    "iframe",
    "canvas",
    "video",
    "audio",
    "object",
    "embed",
  ]) {
    const html = `<div><${tag}></${tag}></div>`;
    const result = validateV6Html(html);
    assert.equal(result.ok, false, `should reject <${tag}>`);
  }
});

test("validateV6Html — rejects onclick / onload / onerror event handlers", () => {
  for (const handler of ["onclick", "onload", "onerror", "onmouseover"]) {
    const html = `<div ${handler}="do()"></div>`;
    const result = validateV6Html(html);
    assert.equal(result.ok, false, `should reject ${handler}`);
    assert.ok(
      result.issues.some((i) => i.code === "forbidden_event_attr"),
      `expected forbidden_event_attr for ${handler}`,
    );
  }
});

test("validateV6Html — rejects CSS animation / transition / @keyframes", () => {
  for (const css of [
    "animation: spin 1s",
    "transition: all 0.3s",
    "background: @keyframes foo",
  ]) {
    const html = `<div style="${css}"></div>`;
    const result = validateV6Html(html);
    assert.equal(result.ok, false, `should reject "${css}"`);
    assert.ok(
      result.issues.some((i) => i.code === "forbidden_css_pattern"),
      `expected forbidden_css_pattern for ${css}`,
    );
  }
});

test("validateV6Html — rejects pseudo-classes and pseudo-elements in inline style", () => {
  // Inline style can't technically declare pseudo rules, but a LLM may still
  // try; validator blocks to keep rendering deterministic.
  const html = `<div style="color: red; ::before { content: 'x' }"></div>`;
  const result = validateV6Html(html);
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((i) => i.code === "forbidden_css_pattern"));
});

test("validateV6Html — rejects root that is not <div>", () => {
  const html = `<section style="width:1200px;height:628px;"></section>`;
  const result = validateV6Html(html);
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((i) => i.code === "root_not_div"));
});

test("validateV6Html — rejects empty / whitespace input", () => {
  for (const html of ["", "   ", "\n\t"]) {
    const result = validateV6Html(html);
    assert.equal(result.ok, false, `should reject ${JSON.stringify(html)}`);
    assert.ok(result.issues.some((i) => i.code === "root_not_found"));
  }
});

test("validateV6Html — v5 grammar constraints are lifted (flex / grid / calc / transform / position:fixed all OK)", () => {
  const liftedCases = [
    "display:flex",
    "display:grid",
    "display:inline-flex",
    "width:calc(100% - 16px)",
    "transform:translate(10px,20px)",
    "position:fixed",
    "position:sticky",
  ];
  for (const css of liftedCases) {
    const html = `<div style="${css}"></div>`;
    const result = validateV6Html(html);
    assert.equal(
      result.ok,
      true,
      `v6 should accept "${css}" (v5 rejected it); got ${JSON.stringify(result.issues)}`,
    );
  }
});
