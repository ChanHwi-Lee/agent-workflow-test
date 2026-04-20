import assert from "node:assert/strict";
import test from "node:test";

import { validateMethodBHtml } from "./v5HtmlValidator.js";

const VALID_HTML = `<div style="position:relative; width:1200px; height:628px; overflow:hidden;">
  <div style="position:absolute; left:0px; top:0px; width:1200px; height:628px; background-color:#FFF5E1;"></div>
  <h1 style="position:absolute; left:80px; top:140px; width:600px; height:110px; font-size:84px; color:#222222;">봄 신메뉴 오픈</h1>
  <p style="position:absolute; left:80px; top:270px; width:600px; height:80px; font-size:36px;">딸기 라떼 할인 진행중</p>
  <img data-tooldi-role="hero" data-hint="hero" data-aspect="4:5" src="placeholder://" style="position:absolute; left:720px; top:80px; width:420px; height:468px;" />
</div>`;

test("validateMethodBHtml passes for a canonical Method B output", () => {
  const result = validateMethodBHtml(VALID_HTML);
  assert.equal(result.ok, true);
  assert.equal(result.rootFound, true);
  assert.equal(result.childCount, 4);
  assert.deepEqual(
    result.issues.filter((i) => i.severity === "error"),
    [],
  );
});

test("validateMethodBHtml rejects missing root", () => {
  const result = validateMethodBHtml("   ");
  assert.equal(result.ok, false);
  assert.equal(result.rootFound, false);
  assert.ok(result.issues.some((i) => i.code === "root_not_found"));
});

test("validateMethodBHtml rejects root shape mismatch", () => {
  const html = `<div style="position:relative; width:1080px; height:1080px;"></div>`;
  const result = validateMethodBHtml(html);
  assert.equal(result.ok, false);
  const shapeIssues = result.issues.filter(
    (i) => i.code === "root_shape_mismatch",
  );
  assert.ok(shapeIssues.length >= 2);
});

test("validateMethodBHtml rejects <br> inside a text element", () => {
  const html = `<div style="position:relative; width:1200px; height:628px; overflow:hidden;">
    <h1 style="position:absolute; left:80px; top:140px; width:600px; height:110px;">봄,<br>신선함</h1>
    <p style="position:absolute; left:80px; top:260px; width:600px; height:80px;">subcopy</p>
    <div style="position:absolute; left:0px; top:0px; width:1200px; height:628px; background-color:#fff;"></div>
  </div>`;
  const result = validateMethodBHtml(html);
  assert.equal(result.ok, false);
  assert.ok(
    result.issues.some(
      (i) => i.code === "forbidden_tag" && i.message.includes("<br>"),
    ),
    "expected forbidden_tag for <br>",
  );
});

test("validateMethodBHtml rejects <a>, <button>, and other forbidden tags", () => {
  const html = `<div style="position:relative; width:1200px; height:628px; overflow:hidden;">
    <button style="position:absolute; left:80px; top:140px; width:200px; height:60px;">CTA</button>
    <a href="#" style="position:absolute; left:80px; top:220px; width:200px; height:40px;">link</a>
    <p style="position:absolute; left:80px; top:300px; width:400px; height:40px;">copy</p>
  </div>`;
  const result = validateMethodBHtml(html);
  assert.equal(result.ok, false);
  const forbidden = result.issues.filter((i) => i.code === "forbidden_tag");
  assert.ok(forbidden.some((i) => i.message.includes("<button>")));
  assert.ok(forbidden.some((i) => i.message.includes("<a>")));
});

test("validateMethodBHtml rejects flex, calc, and translate", () => {
  const html = `<div style="position:relative; width:1200px; height:628px; overflow:hidden;">
    <div style="position:absolute; left:0px; top:0px; width:1200px; height:628px; background-color:#fff; display:flex;"></div>
    <p style="position:absolute; left:calc(50% - 50px); top:140px; width:200px; height:40px;">copy</p>
    <span style="position:absolute; left:100px; top:200px; width:200px; height:40px; transform:translate(-50%, 0);">x</span>
  </div>`;
  const result = validateMethodBHtml(html);
  assert.equal(result.ok, false);
  const violations = result.issues.filter(
    (i) => i.code === "forbidden_css_pattern",
  );
  assert.ok(violations.length >= 3, "expected ≥3 forbidden CSS violations");
});

test("validateMethodBHtml warns when child count is outside 3–12", () => {
  const html = `<div style="position:relative; width:1200px; height:628px; overflow:hidden;">
    <div style="position:absolute; left:0px; top:0px; width:1200px; height:628px; background-color:#fff;"></div>
    <p style="position:absolute; left:80px; top:140px; width:200px; height:40px;">copy</p>
  </div>`;
  const result = validateMethodBHtml(html);
  const warning = result.issues.find(
    (i) => i.code === "child_count_out_of_range",
  );
  assert.ok(warning, "expected child_count_out_of_range warning");
  assert.equal(warning.severity, "warning");
});

test("validateMethodBHtml flags children without position:absolute", () => {
  const html = `<div style="position:relative; width:1200px; height:628px; overflow:hidden;">
    <div style="left:0px; top:0px; width:1200px; height:628px; background-color:#fff;"></div>
    <p style="position:absolute; left:80px; top:140px; width:200px; height:40px;">copy</p>
    <img data-tooldi-role="hero" data-hint="h" data-aspect="1:1" src="placeholder://" />
  </div>`;
  const result = validateMethodBHtml(html);
  assert.equal(result.ok, false);
  const violations = result.issues.filter(
    (i) => i.code === "child_missing_absolute_position",
  );
  assert.ok(violations.length >= 2);
});
