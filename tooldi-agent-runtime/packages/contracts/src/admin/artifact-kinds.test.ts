import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Value } from "@sinclair/typebox/value";
import {
  AdminArtifactFilenameByKind,
  AdminArtifactKindSchema,
  AdminArtifactKindValues,
} from "./artifact-kinds.js";

describe("AdminArtifactKind", () => {
  it("실제 워커 emit kind 8개 + RAG 신규 2개 = 10개", () => {
    assert.equal(AdminArtifactKindValues.length, 10);
  });
  it("모든 kind 가 filename 매핑 존재", () => {
    for (const k of AdminArtifactKindValues) assert.ok(AdminArtifactFilenameByKind[k]);
  });
  it("미등록 kind 는 schema 거절", () => {
    assert.equal(Value.Check(AdminArtifactKindSchema, "v6-html"), false);
    assert.equal(Value.Check(AdminArtifactKindSchema, "executable-plan"), true);
  });
});
