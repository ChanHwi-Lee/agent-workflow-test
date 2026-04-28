export function registerRunJobGraphEdges(graph: any) {
  return graph
    .addEdge("hydrate_input", "normalize_intent")
    .addConditionalEdges("normalize_intent", (state: any) =>
      state.hydrated?.snapshot?.runPolicy?.interviewEnabled === true
        ? "interview_user"
        : "gate_scope",
    )
    .addEdge("interview_user", "gate_scope")
    .addConditionalEdges("gate_scope", (state: any) =>
      state.finalizeDraft
        ? "send_finalize"
        : "maybe_research_visual_trends",
    )
    .addEdge("maybe_research_visual_trends", "v6_freeform_layout_pipeline")
    .addEdge("v6_freeform_layout_pipeline", "prepare_execution")
    .addConditionalEdges("prepare_execution", (state: any) =>
      state.finalizeDraft
        ? "send_finalize"
        : state.currentProposal
          ? "emit_stage"
          : "prepare_finalize",
    )
    .addConditionalEdges("emit_stage", (state: any) =>
      state.currentMutationId ? "await_stage_ack" : "prepare_finalize",
    )
    .addEdge("await_stage_ack", "advance_after_ack")
    .addConditionalEdges("advance_after_ack", (state: any) => {
      if (
        state.lastMutationAck?.status !== "acked" ||
        state.cooperativeStopRequested
      ) {
        return "prepare_finalize";
      }
      if (state.currentProposal) {
        return "emit_stage";
      }
      return "emit_save_stage";
    })
    .addConditionalEdges("emit_save_stage", (state: any) =>
      state.currentMutationId ? "await_save_ack" : "prepare_finalize",
    )
    .addEdge("await_save_ack", "prepare_finalize")
    .addEdge("prepare_finalize", "send_finalize");
}
