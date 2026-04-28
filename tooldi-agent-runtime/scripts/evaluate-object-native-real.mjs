import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import {
  buildMutationAckRequest,
  createStartRunRequest,
} from "./smoke-in-process.mjs";

const DEFAULT_PROMPTS = [
  "식당에서 신규 봄 계절메뉴를 만들어줘",
  "카페의 신메뉴 딸기 음료 홍보 템플릿 만들어줘",
  "패션 리테일 봄 세일 배너 만들어줘",
  "봄 세일 배너를 만들어줘",
];

const DEFAULT_TIMEOUT_MS = 120000;
const DEFAULT_CANVAS_WIDTH = 1200;
const DEFAULT_CANVAS_HEIGHT = 628;
const DEFAULT_SIZE_SERIAL = "1200x628@1";
const DEFAULT_WORKFLOW_VARIANT = "object_native_v1";

const options = parseCliArgs(process.argv.slice(2));
const prompts = options.prompts.length > 0 ? options.prompts : DEFAULT_PROMPTS;
const limitedPrompts =
  options.limit === null ? prompts : prompts.slice(0, Math.max(options.limit, 0));
const baseUrl =
  options.baseUrl ??
  process.env.AGENT_WORKFLOW_BASE_URL ??
  process.env.PUBLIC_BASE_URL ??
  "http://127.0.0.1:3100";
const objectStoreRootDir =
  process.env.OBJECT_STORE_ROOT_DIR ?? "/tmp/tooldi-agent-runtime-toolditor-local";
const objectStoreBucket =
  process.env.OBJECT_STORE_BUCKET ?? "tooldi-agent-runtime-toolditor-local";
const objectStorePrefix =
  process.env.OBJECT_STORE_PREFIX ?? "agent-runtime-toolditor-local";
const workflowVariant = options.workflowVariant ?? DEFAULT_WORKFLOW_VARIANT;
const outputPath =
  options.output ??
  resolve(
    objectStoreRootDir,
    "object-native-real-eval",
    `report_${new Date().toISOString().replaceAll(":", "").replaceAll(".", "")}.json`,
  );

if (limitedPrompts.length === 0) {
  throw new Error("No prompts selected for evaluation.");
}

const startedAt = new Date().toISOString();
const results = [];

console.log(
  `[object-native-real-eval] base=${baseUrl} workflowVariant=${workflowVariant} prompts=${limitedPrompts.length} objectStore=${resolve(
    objectStoreRootDir,
    objectStoreBucket,
    objectStorePrefix,
  )}`,
);

for (const [index, prompt] of limitedPrompts.entries()) {
  const ordinal = `${index + 1}/${limitedPrompts.length}`;
  console.log(`[object-native-real-eval] starting ${ordinal}: ${prompt}`);
  const result = await evaluatePrompt({
    baseUrl,
    prompt,
    timeoutMs: options.timeoutMs,
    canvasWidth: options.canvasWidth,
    canvasHeight: options.canvasHeight,
    sizeSerial: options.sizeSerial,
    workflowVariant,
    objectStoreRootDir,
    objectStoreBucket,
    objectStorePrefix,
  });
  results.push(result);

  if (result.error) {
    console.log(
      `[object-native-real-eval] ${ordinal} failed run=${result.runId ?? "n/a"} error=${result.error}`,
    );
    continue;
  }

  console.log(
    `[object-native-real-eval] ${ordinal} run=${result.runId} v6Commands=${result.v6CommandCount ?? "n/a"} renderBlocking=${result.v6RenderBlockingIssueCount ?? "n/a"} saveReceipt=${result.hasLatestSaveReceipt ? "yes" : "no"} saveEvidence=${result.hasLatestSaveEvidence ? "yes" : "no"}`,
  );
}

const summary = buildAggregateSummary({
  startedAt,
  finishedAt: new Date().toISOString(),
  baseUrl,
  objectStoreRootDir,
  objectStoreBucket,
  objectStorePrefix,
  prompts: limitedPrompts,
  results,
});

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

console.log("");
console.log("[object-native-real-eval] aggregate");
console.log(
  JSON.stringify(
    {
      totalRuns: summary.totalRuns,
      completedRuns: summary.completedRuns,
      erroredRuns: summary.erroredRuns,
      v6CommandCounts: summary.v6CommandCounts,
      renderQualityBlockingRuns: summary.renderQualityBlockingRuns,
      legacyArtifactPresence: summary.legacyArtifactPresence,
      saveReceiptMissingRuns: summary.saveReceiptMissingRuns,
      saveEvidenceMissingRuns: summary.saveEvidenceMissingRuns,
      saveTruthCounts: summary.saveTruthCounts,
      errorCounts: summary.errorCounts,
      nextStep: summary.nextStep,
      reportPath: outputPath,
    },
    null,
    2,
  ),
);

async function evaluatePrompt({
  baseUrl,
  prompt,
  timeoutMs,
  canvasWidth,
  canvasHeight,
  sizeSerial,
  objectStoreRootDir,
  objectStoreBucket,
  objectStorePrefix,
  workflowVariant,
}) {
  let accepted = null;

  try {
    accepted = await startRun({
      baseUrl,
      prompt,
      canvasWidth,
      canvasHeight,
      sizeSerial,
      workflowVariant,
    });
    const lifecycle = await driveRunLifecycle({
      accepted,
      timeoutMs,
    });
    const artifacts = await readRunArtifacts({
      runId: accepted.runId,
      objectStoreRootDir,
      objectStoreBucket,
      objectStorePrefix,
    });

    const auditEntries = artifacts.audit?.entries ?? [];
    const selectedAuditEntry =
      auditEntries.find(
        (entry) =>
          entry.templateCode === artifacts.selection?.nextSelectedTemplateCode,
      ) ?? auditEntries[0] ?? null;
    const clusterKinds = Array.from(
      new Set(
        (artifacts.clusterGraph?.blocks ?? [])
          .map((block) => block.kind)
          .filter(Boolean),
      ),
    );
    const latestSaveReceipt = artifacts.bundle?.saveMetadata?.latestSaveReceipt ?? null;
    const latestSaveEvidence = artifacts.bundle?.saveMetadata?.latestSaveEvidence ?? null;
    const checkpoints = artifacts.bundle?.mutationLedger?.checkpoints ?? [];
    const v6Commands =
      artifacts.executablePlan?.actions?.[0]?.inputs?.v6Commands ?? [];
    const v6RenderIssues = artifacts.v6RenderQualityReport?.issues ?? [];
    const v6RenderBlockingIssues =
      artifacts.v6RenderQualityReport?.blockingIssues ??
      v6RenderIssues.filter((issue) => issue?.blocking === true);
    const selectedDiagnostics =
      artifacts.selection?.selectedDiagnostics ??
      artifacts.renderability?.selectedDiagnostics ??
      selectedAuditEntry?.diagnostics ??
      null;

    return {
      prompt,
      runId: accepted.runId,
      traceId: accepted.traceId,
      requestWorkflowVariant: workflowVariant,
      runLogs: lifecycle.runLogs,
      candidateCount: artifacts.templatePriorBundle?.candidates?.length ?? 0,
      templatePriorFailedQueryCount:
        artifacts.templatePriorBundle?.diagnostics?.failedQueryCount ?? 0,
      templatePriorSuccessfulQueryCount:
        artifacts.templatePriorBundle?.diagnostics?.successfulQueryCount ?? 0,
      templatePriorQueryDiagnostics:
        artifacts.templatePriorBundle?.diagnostics?.queryDiagnostics ?? [],
      previousSelectedTemplateCode:
        artifacts.selection?.previousSelectedTemplateCode ?? null,
      nextSelectedTemplateCode:
        artifacts.selection?.nextSelectedTemplateCode ?? null,
      reselectionApplied: Boolean(artifacts.selection?.reselectionApplied),
      selectedReadiness: artifacts.selection?.selectedReadiness ?? null,
      failureStage:
        artifacts.renderability?.failureStage ??
        artifacts.selection?.selectedFailureStage ??
        selectedAuditEntry?.failureStage ??
        null,
      compositionStatus:
        artifacts.renderability?.compositionStatus ??
        artifacts.freeformLayoutPlan?.compositionStatus ??
        selectedAuditEntry?.compositionStatus ??
        null,
      renderabilityPassed: Boolean(artifacts.renderability?.passed),
      renderabilityReason: artifacts.renderability?.reason ?? null,
      selectedWarnings: selectedAuditEntry?.warnings ?? [],
      selectedDiagnostics,
      semanticGateReason: selectedDiagnostics?.semanticGateReason ?? null,
      missingClusterFamilies: selectedDiagnostics?.missingClusterFamilies ?? [],
      textBearingClusterCount:
        selectedDiagnostics?.textBearingClusterCount ?? null,
      contentClusterCount: selectedDiagnostics?.contentClusterCount ?? null,
      bindingCoverage: selectedDiagnostics?.bindingCoverage ?? null,
      renderabilityMetrics: selectedDiagnostics?.renderabilityMetrics ?? null,
      clusterKinds,
      checkpointCount: checkpoints.length,
      hasLatestSaveReceipt: latestSaveReceipt !== null,
      hasLatestSaveEvidence: latestSaveEvidence !== null,
      latestSaveReceipt,
      latestSaveEvidence,
      savedOutputTemplateCode: latestSaveReceipt?.outputTemplateCode ?? null,
      hasLegacyObjectNativeArtifacts: {
        audit: artifacts.audit !== null,
        selection: artifacts.selection !== null,
        renderability: artifacts.renderability !== null,
        clusterGraph: artifacts.clusterGraph !== null,
        templatePriorBundle: artifacts.templatePriorBundle !== null,
      },
      v6PlanSchemaVersion: artifacts.executablePlan?.planSchemaVersion ?? null,
      v6CommandCount: Array.isArray(v6Commands) ? v6Commands.length : null,
      v6RenderIssueCount: v6RenderIssues.length,
      v6RenderBlockingIssueCount: v6RenderBlockingIssues.length,
      v6RenderQualitySummary: artifacts.v6RenderQualityReport?.summary ?? null,
      hasCanonicalDesignBrief: artifacts.canonicalDesignBrief !== null,
      hasBriefCompilationReport: artifacts.briefCompilationReport !== null,
      hasTrendBrief: artifacts.trendBrief !== null,
      hasDebugV6Html: artifacts.debugV6Html !== null,
      hasDebugUnrestrictedHtml: artifacts.debugUnrestrictedHtml !== null,
      objectNativeSummary: {
        auditSummary: artifacts.audit?.summary ?? null,
        selectionSummary: artifacts.selection?.summary ?? null,
        renderabilitySummary: artifacts.renderability?.summary ?? null,
        qualityEvalSummary: artifacts.qualityEvalSummary?.summary ?? null,
      },
    };
  } catch (error) {
    return {
      prompt,
      runId: accepted?.runId ?? null,
      traceId: accepted?.traceId ?? null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function startRun({
  baseUrl,
  prompt,
  canvasWidth,
  canvasHeight,
  sizeSerial,
  workflowVariant,
}) {
  const response = await fetch(`${baseUrl}/api/agent-workflow/runs`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(
      createStartRunRequest("object-native-real-eval", {
        prompt,
        workflowVariant,
        canvasWidth,
        canvasHeight,
        sizeSerial,
      }),
    ),
  });

  if (!response.ok) {
    throw new Error(
      `POST /runs failed with ${response.status}: ${await response.text()}`,
    );
  }

  return response.json();
}

async function driveRunLifecycle({ accepted, timeoutMs }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort(new Error("Timed out while waiting for run completion"));
  }, timeoutMs);

  let currentRevision = 0;
  const runLogs = [];
  let reader = null;

  try {
    const response = await fetch(accepted.streamUrl, {
      signal: controller.signal,
      headers: {
        Accept: "text/event-stream",
      },
    });
    if (!response.ok || !response.body) {
      throw new Error(`Failed to open SSE stream: ${response.status}`);
    }

    reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      let delimiterIndex = buffer.indexOf("\n\n");
      while (delimiterIndex >= 0) {
        const chunk = buffer.slice(0, delimiterIndex);
        buffer = buffer.slice(delimiterIndex + 2);
        delimiterIndex = buffer.indexOf("\n\n");

        const event = parseSseChunk(chunk);
        if (!event) {
          continue;
        }

        switch (event.event) {
          case "run.log": {
            const payload = JSON.parse(event.data);
            runLogs.push(String(payload.message ?? ""));
            break;
          }
          case "canvas.mutation": {
            const payload = JSON.parse(event.data);
            currentRevision = await postMutationAck(
              accepted,
              payload,
              currentRevision,
            );
            break;
          }
          case "run.failed":
            throw new Error(`Run failed: ${event.data}`);
          case "run.completed":
            await reader.cancel().catch(() => {});
            return { runLogs };
          default:
            break;
        }
      }
    }

    throw new Error("SSE stream closed before run.completed");
  } finally {
    clearTimeout(timeout);
    controller.abort();
    if (reader) {
      await reader.cancel().catch(() => {});
    }
  }
}

function parseSseChunk(chunk) {
  if (chunk.startsWith(":") || chunk.trim().length === 0) {
    return null;
  }

  const lines = chunk.split("\n");
  let event = "message";
  let data = "";

  for (const line of lines) {
    if (line.startsWith("event: ")) {
      event = line.slice("event: ".length);
      continue;
    }
    if (line.startsWith("data: ")) {
      data += line.slice("data: ".length);
    }
  }

  return {
    event,
    data,
  };
}

async function postMutationAck(accepted, payload, currentRevision) {
  const { request, resultingRevision } = buildMutationAckRequest(
    accepted,
    payload,
    currentRevision,
  );
  const response = await fetch(accepted.mutationAckUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error(
      `Mutation ack failed with ${response.status}: ${await response.text()}`,
    );
  }

  return resultingRevision;
}

async function readRunArtifacts({
  runId,
  objectStoreRootDir,
  objectStoreBucket,
  objectStorePrefix,
}) {
  const attemptRoot = resolve(
    objectStoreRootDir,
    objectStoreBucket,
    objectStorePrefix,
    `runs/${runId}/attempts/1`,
  );
  const artifactsRoot = resolve(
    objectStoreRootDir,
    objectStoreBucket,
    objectStorePrefix,
    `runs/${runId}/artifacts`,
  );

  const [
    templatePriorBundle,
    audit,
    selection,
    renderability,
    clusterGraph,
    freeformLayoutPlan,
    qualityEvalSummary,
    canonicalDesignBrief,
    briefCompilationReport,
    trendBrief,
    v6RenderQualityReport,
    debugV6Html,
    debugUnrestrictedHtml,
    executablePlan,
    topologyMatch,
    topologySelection,
    topologyCompletion,
    bundle,
  ] = await Promise.all([
    readJsonOrNullWithRetry(resolve(attemptRoot, "template-prior-bundle.json")),
    readJsonOrNullWithRetry(resolve(attemptRoot, "object-native-reference-audit.json")),
    readJsonOrNullWithRetry(resolve(attemptRoot, "object-native-candidate-selection.json")),
    readJsonOrNullWithRetry(resolve(attemptRoot, "object-native-renderability-report.json")),
    readJsonOrNullWithRetry(resolve(attemptRoot, "object-native-cluster-graph.json")),
    readJsonOrNullWithRetry(resolve(attemptRoot, "object-native-freeform-layout-plan.json")),
    readJsonOrNullWithRetry(resolve(attemptRoot, "object-native-quality-eval-summary.json")),
    readJsonOrNullWithRetry(resolve(attemptRoot, "canonical-design-brief.json")),
    readJsonOrNullWithRetry(resolve(attemptRoot, "brief-compilation-report.json")),
    readJsonOrNullWithRetry(resolve(attemptRoot, "v6-trend-brief.json")),
    readJsonWithRetry(resolve(attemptRoot, "v6-render-quality-report.json")),
    readJsonOrNullWithRetry(resolve(attemptRoot, "debug-v6-html.json")),
    readJsonOrNullWithRetry(resolve(attemptRoot, "debug-unrestricted-html.json")),
    readJsonWithRetry(resolve(attemptRoot, "executable-plan.json")),
    readJsonOrNullWithRetry(resolve(attemptRoot, "topology-match-report.json")),
    readJsonOrNullWithRetry(resolve(attemptRoot, "topology-selection.json")),
    readJsonOrNullWithRetry(resolve(attemptRoot, "topology-completion-report.json")),
    readJsonWithRetry(resolve(artifactsRoot, `bundle_${runId}.json`)),
  ]);

  return {
    templatePriorBundle,
    audit,
    selection,
    renderability,
    clusterGraph,
    freeformLayoutPlan,
    qualityEvalSummary,
    canonicalDesignBrief,
    briefCompilationReport,
    trendBrief,
    v6RenderQualityReport,
    debugV6Html,
    debugUnrestrictedHtml,
    executablePlan,
    topologyMatch,
    topologySelection,
    topologyCompletion,
    bundle,
  };
}

async function readJsonWithRetry(filePath, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      return JSON.parse(await readFile(filePath, "utf8"));
    } catch (error) {
      lastError = error;
      await sleep(150);
    }
  }

  throw new Error(
    `Timed out while reading ${filePath}: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}

async function readJsonOrNullWithRetry(filePath, timeoutMs = 2000) {
  try {
    return await readJsonWithRetry(filePath, timeoutMs);
  } catch {
    return null;
  }
}

function buildAggregateSummary({
  startedAt,
  finishedAt,
  baseUrl,
  objectStoreRootDir,
  objectStoreBucket,
  objectStorePrefix,
  prompts,
  results,
}) {
  const completedResults = results.filter((result) => !result.error);
  const erroredResults = results.filter((result) => result.error);
  const errorCounts = countBy(
    erroredResults.map((result) => normalizeErrorMessage(result.error)),
  );
  const v6CommandCounts = countBy(
    completedResults.map((result) => String(result.v6CommandCount ?? "unknown")),
  );
  const legacyArtifactPresence = {
    templatePriorBundle: completedResults.filter(
      (result) => result.hasLegacyObjectNativeArtifacts?.templatePriorBundle,
    ).length,
    audit: completedResults.filter(
      (result) => result.hasLegacyObjectNativeArtifacts?.audit,
    ).length,
    selection: completedResults.filter(
      (result) => result.hasLegacyObjectNativeArtifacts?.selection,
    ).length,
    renderability: completedResults.filter(
      (result) => result.hasLegacyObjectNativeArtifacts?.renderability,
    ).length,
    clusterGraph: completedResults.filter(
      (result) => result.hasLegacyObjectNativeArtifacts?.clusterGraph,
    ).length,
  };
  const saveTruthCounts = {
    complete: completedResults.filter(
      (result) => result.hasLatestSaveReceipt && result.hasLatestSaveEvidence,
    ).length,
    receiptOnly: completedResults.filter(
      (result) => result.hasLatestSaveReceipt && !result.hasLatestSaveEvidence,
    ).length,
    evidenceOnly: completedResults.filter(
      (result) => !result.hasLatestSaveReceipt && result.hasLatestSaveEvidence,
    ).length,
    missingBoth: completedResults.filter(
      (result) => !result.hasLatestSaveReceipt && !result.hasLatestSaveEvidence,
    ).length,
  };
  return {
    startedAt,
    finishedAt,
    baseUrl,
    objectStoreRootDir,
    objectStoreBucket,
    objectStorePrefix,
    prompts,
    totalRuns: results.length,
    completedRuns: completedResults.length,
    erroredRuns: erroredResults.length,
    v6CommandCounts,
    renderQualityBlockingRuns: completedResults.filter(
      (result) => (result.v6RenderBlockingIssueCount ?? 0) > 0,
    ).length,
    legacyArtifactPresence,
    saveReceiptMissingRuns: completedResults.filter(
      (result) => !result.hasLatestSaveReceipt,
    ).length,
    saveEvidenceMissingRuns: completedResults.filter(
      (result) => !result.hasLatestSaveEvidence,
    ).length,
    saveTruthCounts,
    errorCounts,
    nextStep: inferNextStep({
      completedResults,
      erroredResults,
    }),
    results,
  };
}

function inferNextStep({
  completedResults,
  erroredResults,
}) {
  if (erroredResults.length > 0) {
    return "Some v6 real eval runs failed. Inspect errorCounts and per-run logs before treating the browser run as acceptance evidence.";
  }

  if (completedResults.length === 0) {
    return "No completed runs were captured. Verify the local stack before using browser evidence.";
  }

  const missingCommandRuns = completedResults.filter(
    (result) => (result.v6CommandCount ?? 0) <= 0,
  ).length;
  if (missingCommandRuns > 0) {
    return "At least one completed run produced no v6 commands. Inspect executable-plan.json and render-quality artifacts.";
  }

  const renderBlockingRuns = completedResults.filter(
    (result) => (result.v6RenderBlockingIssueCount ?? 0) > 0,
  ).length;
  if (renderBlockingRuns > 0) {
    return "Completed runs include render-quality blocking issues. Inspect v6-render-quality-report.json before accepting visual quality.";
  }

  const saveEvidenceMissingRuns = completedResults.filter(
    (result) => !result.hasLatestSaveEvidence,
  ).length;
  if (saveEvidenceMissingRuns > 0) {
    return "Save receipts exist but save evidence is missing in some completed runs. Fix save-truth materialization before treating browser runs as acceptance evidence.";
  }

  return "v6 real eval completed with commands, render-quality reports, and save truth. Browser/HITL review is the next quality gate.";
}

function normalizeErrorMessage(error) {
  const text = String(error ?? "");
  if (text.includes("Tooldi template list endpoint returned an invalid payload")) {
    return "template_list_invalid_payload";
  }
  if (text.includes("Timed out while waiting for run completion")) {
    return "run_timeout";
  }
  return text;
}

function countBy(values) {
  return values.reduce((counts, value) => {
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

function parseCliArgs(argv) {
  const options = {
    prompts: [],
    limit: null,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    baseUrl: null,
    output: null,
    canvasWidth: DEFAULT_CANVAS_WIDTH,
    canvasHeight: DEFAULT_CANVAS_HEIGHT,
    sizeSerial: DEFAULT_SIZE_SERIAL,
    workflowVariant: DEFAULT_WORKFLOW_VARIANT,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    switch (arg) {
      case "--":
        break;
      case "--prompt":
        if (!next) {
          throw new Error("--prompt requires a value");
        }
        options.prompts.push(next);
        index += 1;
        break;
      case "--limit":
        if (!next) {
          throw new Error("--limit requires a value");
        }
        options.limit = Number.parseInt(next, 10);
        index += 1;
        break;
      case "--timeout-ms":
        if (!next) {
          throw new Error("--timeout-ms requires a value");
        }
        options.timeoutMs = Number.parseInt(next, 10);
        index += 1;
        break;
      case "--base-url":
        if (!next) {
          throw new Error("--base-url requires a value");
        }
        options.baseUrl = next;
        index += 1;
        break;
      case "--output":
        if (!next) {
          throw new Error("--output requires a value");
        }
        options.output = resolve(next);
        index += 1;
        break;
      case "--canvas-width":
        if (!next) {
          throw new Error("--canvas-width requires a value");
        }
        options.canvasWidth = Number.parseInt(next, 10);
        index += 1;
        break;
      case "--canvas-height":
        if (!next) {
          throw new Error("--canvas-height requires a value");
        }
        options.canvasHeight = Number.parseInt(next, 10);
        index += 1;
        break;
      case "--size-serial":
        if (!next) {
          throw new Error("--size-serial requires a value");
        }
        options.sizeSerial = next;
        index += 1;
        break;
      case "--workflow-variant":
        if (!next) {
          throw new Error("--workflow-variant requires a value");
        }
        options.workflowVariant = next;
        index += 1;
        break;
      case "--help":
        printHelp();
        process.exit(0);
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function printHelp() {
  console.log(`Usage: node ./scripts/evaluate-object-native-real.mjs [options]

Options:
  --prompt <text>         Add a prompt to evaluate. Can be repeated.
  --limit <n>             Limit how many prompts run from the selected set.
  --timeout-ms <n>        Per-run SSE timeout in milliseconds.
  --base-url <url>        Agent workflow API base URL.
  --output <path>         Write the JSON report to a specific path.
  --canvas-width <n>      Canvas width for each run.
  --canvas-height <n>     Canvas height for each run.
  --size-serial <value>   Size serial for each run.
  --workflow-variant <v>  Workflow variant to run. Default: object_native_v1.
  --help                  Print this help message.
`);
}

async function sleep(ms) {
  await new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}
