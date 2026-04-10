export function registerRunJobGraphEdges(graph: any) {
  return graph
    .addEdge("hydrate_input", "plan_intent_draft")
    .addEdge("plan_intent_draft", "normalize_intent")
    .addEdge("normalize_intent", "gate_scope")
    .addConditionalEdges("gate_scope", (state: any) =>
      state.finalizeDraft ? "send_finalize" : "build_copy_and_abstract_layout_plan",
    )
    .addEdge("build_copy_and_abstract_layout_plan", "build_template_prior_summary")
    .addEdge("build_template_prior_summary", "build_search_profile")
    .addEdge("build_search_profile", "compute_retrieval_policy")
    .addEdge("compute_retrieval_policy", "assemble_candidates")
    .addConditionalEdges("assemble_candidates", (state: any) =>
      state.finalizeDraft ? "send_finalize" : "select_composition",
    )
    .addEdge("select_composition", "build_asset_plan")
    .addEdge("build_asset_plan", "build_concrete_layout_plan")
    .addEdge("build_concrete_layout_plan", "select_typography")
    .addEdge("select_typography", "persist_selection_artifacts")
    .addEdge("persist_selection_artifacts", "build_plan")
    .addEdge("build_plan", "rule_judge")
    .addConditionalEdges("rule_judge", (state: any) =>
      state.ruleJudgeVerdict?.recommendation === "refuse"
        ? "prepare_finalize"
        : "prepare_execution",
    )
    .addConditionalEdges("prepare_execution", (state: any) =>
      state.currentProposal ? "emit_stage" : "build_execution_scene_summary",
    )
    .addConditionalEdges("emit_stage", (state: any) =>
      state.currentMutationId ? "await_stage_ack" : "build_execution_scene_summary",
    )
    .addEdge("await_stage_ack", "advance_after_ack")
    .addConditionalEdges("advance_after_ack", (state: any) => {
      if (state.lastMutationAck?.status !== "acked" || state.cooperativeStopRequested) {
        return "build_execution_scene_summary";
      }
      return state.currentProposal ? "emit_stage" : "build_execution_scene_summary";
    })
    .addEdge("build_execution_scene_summary", "build_judge_plan")
    .addEdge("build_judge_plan", "decide_refine")
    .addConditionalEdges("decide_refine", (state: any) =>
      state.refineDecision?.decision === "patch" ? "emit_refinement_patch" : "prepare_finalize",
    )
    .addConditionalEdges("emit_refinement_patch", (state: any) =>
      state.currentMutationId ? "await_refinement_ack" : "prepare_finalize",
    )
    .addEdge("await_refinement_ack", "build_execution_scene_summary")
    .addEdge("prepare_finalize", "send_finalize");
}
