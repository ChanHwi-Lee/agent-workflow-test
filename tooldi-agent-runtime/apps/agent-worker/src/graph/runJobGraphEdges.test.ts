import assert from "node:assert/strict";
import test from "node:test";

import { registerRunJobGraphEdges } from "./runJobGraphEdges.js";

interface CapturedConditional {
  from: string;
  routerTargets: string[];
}

const PROBE_STATES: Array<Record<string, unknown>> = [
  {},
  { hydrated: { snapshot: { runPolicy: { interviewEnabled: true } } } },
  { hydrated: { snapshot: { runPolicy: { interviewEnabled: false } } } },
  { finalizeDraft: { marker: "any-truthy-draft" } },
  { currentProposal: { mutationId: "m" } },
  { currentMutationId: "m" },
  { lastMutationAck: { status: "acked" }, currentProposal: null },
  { lastMutationAck: { status: "acked" }, currentProposal: { x: 1 } },
  { lastMutationAck: { status: "rejected" } },
  { lastMutationAck: { status: "cancelled" } },
  {
    cooperativeStopRequested: true,
    lastMutationAck: { status: "acked" },
  },
];

function captureConditionals(): {
  byFrom: Map<string, CapturedConditional>;
} {
  const byFrom = new Map<string, CapturedConditional>();
  const stub = {
    addEdge() {
      return stub;
    },
    addConditionalEdges(from: string, router: (state: unknown) => string) {
      const targets = new Set<string>();
      for (const state of PROBE_STATES) {
        try {
          targets.add(router(state));
        } catch {
          // Routers may throw on partial probe states; ignore.
        }
      }
      byFrom.set(from, { from, routerTargets: [...targets] });
      return stub;
    },
  };
  registerRunJobGraphEdges(stub);
  return { byFrom };
}

function getRouterTargets(
  byFrom: Map<string, CapturedConditional>,
  from: string,
): Set<string> {
  const captured = byFrom.get(from);
  assert.ok(captured, `expected conditional router from ${from}`);
  return new Set(captured.routerTargets);
}

test("prepare_execution 라우터는 finalize 우선, currentProposal 있으면 emit_stage, 둘 다 없으면 prepare_finalize 로 보낸다", () => {
  const { byFrom } = captureConditionals();
  const targets = getRouterTargets(byFrom, "prepare_execution");

  assert.ok(
    targets.has("send_finalize"),
    "finalizeDraft 가 있으면 즉시 finalize",
  );
  assert.ok(
    targets.has("emit_stage"),
    "currentProposal 이 있으면 staging 진입",
  );
  assert.ok(
    targets.has("prepare_finalize"),
    "cooperative stop 으로 propose 할 envelope 이 없으면 finalize 로 surface",
  );
});

test("emit_stage 라우터는 mutationId 가 있으면 ack 대기, 없으면 finalize 로 보낸다", () => {
  const { byFrom } = captureConditionals();
  const targets = getRouterTargets(byFrom, "emit_stage");

  assert.ok(targets.has("await_stage_ack"));
  assert.ok(
    targets.has("prepare_finalize"),
    "envelope emit 실패 시 legacy refinement 가 아닌 finalize 로 직행",
  );
});

test("advance_after_ack 라우터는 ack 실패/취소시 finalize, 다음 proposal 있으면 emit_stage, 정상 drain 이면 emit_save_stage 로 보낸다", () => {
  const { byFrom } = captureConditionals();
  const targets = getRouterTargets(byFrom, "advance_after_ack");

  assert.ok(
    targets.has("prepare_finalize"),
    "ack 가 acked 가 아니거나 cooperative stop 이면 finalize",
  );
  assert.ok(
    targets.has("emit_stage"),
    "남은 proposal 이 있으면 다음 stage 로 진행",
  );
  assert.ok(
    targets.has("emit_save_stage"),
    "정상 drain 후엔 v6 save stage 로 진행",
  );
});

test("emit_save_stage 라우터는 mutationId 가 있으면 save ack 대기, 없으면 finalize 로 보낸다", () => {
  const { byFrom } = captureConditionals();
  const targets = getRouterTargets(byFrom, "emit_save_stage");

  assert.ok(targets.has("await_save_ack"));
  assert.ok(targets.has("prepare_finalize"));
});
