// AGW v6 Phase 2 — PoC commands → Toolditor fixture TS generator.
//
// Purpose: takes deterministic v6 PoC intermediate commands
// (v6-poc/commands/*.json) and produces AgentCreateLayerCommand[] fixtures
// that Toolditor's agent-workflow-spike can inject directly, without needing
// the 3100 agent-runtime (which is still on v5 pipeline pre-Phase-4).
//
// Pure JS port of apps/agent-worker/src/phases/v6CommandAdapter.ts. Keep this
// file aligned with that adapter — any schema drift must be mirrored here.
//
// Output: toolditor/src/features/agent-workflow-spike/fixtures/v6Fixtures.ts
// This generator and the output file are Phase 2 verification scaffolding;
// both removed after Phase 4 LangGraph swap lands.

import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const COMMANDS_DIR = join(__dirname, 'commands');
const OUTPUT_PATH = join(
  __dirname,
  '..',
  '..',
  '..',
  'toolditor',
  'src',
  'features',
  'agent-workflow-spike',
  'fixtures',
  'v6Fixtures.ts'
);
const RUN_ID = 'fixture';

function mapLayerType(cmd) {
  switch (cmd.primitive) {
    case 'rect':
      return 'shape';
    case 'text':
      return 'text';
    case 'image':
      return 'image';
    case 'bitmap':
      return 'bitmap';
    case 'svg':
      return 'svg';
    default:
      throw new Error(`unknown primitive: ${cmd.primitive}`);
  }
}

function normalizeBorderRadius(r) {
  if (typeof r === 'number') return r;
  if (Array.isArray(r)) {
    return {
      topLeft: r[0],
      topRight: r[1],
      bottomRight: r[2],
      bottomLeft: r[3],
    };
  }
  return 0;
}

function gradientTokens(g) {
  return {
    type: g.type,
    angle: g.angle,
    stops: g.stops.map((s) => ({ color: s.color, offset: s.offset })),
  };
}

function rectTokens(cmd) {
  const tokens = {};
  if (cmd.fill !== null && cmd.fill !== undefined) {
    if (typeof cmd.fill === 'string') {
      tokens.fillColor = cmd.fill;
    } else {
      tokens.fill = gradientTokens(cmd.fill);
    }
  }
  tokens.borderRadius = normalizeBorderRadius(cmd.borderRadius);
  if (cmd.stroke) {
    tokens.stroke = { color: cmd.stroke.color, width: cmd.stroke.width };
  }
  if (cmd.shadow) {
    tokens.shadow = cmd.shadow;
  }
  return tokens;
}

function textTokens(cmd) {
  return {
    fillColor: cmd.color,
    fontFamily: cmd.fontFamily,
    fontSize: cmd.fontSize,
    fontWeight: cmd.fontWeight,
    fontStyle: cmd.fontStyle,
    textAlign: cmd.textAlign,
    lineHeight: cmd.lineHeight === 'normal' ? null : cmd.lineHeight,
    letterSpacing: cmd.letterSpacing,
    textDecoration: cmd.textDecoration,
  };
}

function imageTokens(cmd) {
  return {
    objectFit: cmd.objectFit,
    borderRadius: normalizeBorderRadius(cmd.borderRadius),
  };
}

function buildStyleTokens(cmd) {
  const base = { opacity: cmd.opacity };
  if (cmd.transform !== undefined && cmd.transform !== null) {
    base.transform = cmd.transform;
  }
  switch (cmd.primitive) {
    case 'rect':
      return { ...base, ...rectTokens(cmd) };
    case 'text':
      return { ...base, ...textTokens(cmd) };
    case 'image':
    case 'bitmap':
      return { ...base, ...imageTokens(cmd) };
    case 'svg':
      return base;
    default:
      return base;
  }
}

function buildMetadata(cmd) {
  const base = {
    v6Primitive: cmd.primitive,
    sourceSerial: cmd.source.serial,
    sourcePath: cmd.source.path,
    sourceTag: cmd.source.tag,
  };
  switch (cmd.primitive) {
    case 'text':
      return { ...base, text: cmd.text };
    case 'image':
    case 'bitmap':
      return {
        ...base,
        src: cmd.src,
        naturalWidth: cmd.naturalWidth,
        naturalHeight: cmd.naturalHeight,
        alt: cmd.alt ?? null,
      };
    case 'svg':
      return { ...base, outerHTML: cmd.outerHTML };
    case 'rect':
    default:
      return base;
  }
}

function buildClientLayerKey(runId, seq, layerType) {
  return `v6:${runId}:${String(seq).padStart(3, '0')}:${layerType}`;
}

function buildCommandId(runId, seq) {
  return `cmd:${runId}:${String(seq).padStart(3, '0')}`;
}

function adaptOne(cmd, runId, seq) {
  const layerType = mapLayerType(cmd);
  const clientLayerKey = buildClientLayerKey(runId, seq, layerType);
  const commandId = buildCommandId(runId, seq);
  const bounds = {
    x: cmd.bounds.left,
    y: cmd.bounds.top,
    width: Math.max(1, cmd.bounds.width),
    height: Math.max(1, cmd.bounds.height),
  };

  return {
    commandId,
    op: 'createLayer',
    executionSlotKey: null,
    clientLayerKey,
    targetRef: { layerId: null, clientLayerKey },
    targetLayerVersion: null,
    parentRef: { position: 'append' },
    expectedLayerType: null,
    allowNoop: false,
    metadataTags: {},
    layerBlueprint: {
      layerType,
      bounds,
      styleTokens: buildStyleTokens(cmd),
      metadata: buildMetadata(cmd),
    },
    editable: true,
  };
}

function adaptPoc(poc) {
  const creates = poc.commands.filter((c) => c.type === 'create');
  return creates.map((c, i) => adaptOne(c, RUN_ID, i + 1));
}

function sampleLabel(filename) {
  return filename.replace(/^sample-\d+-/, '').replace(/\.json$/, '');
}

function render(fixtures) {
  const header = `// AUTO-GENERATED by agent-workflow-test/v6-poc/buildToolditorFixtures.mjs
// Source: v6-poc/commands/*.json (5 PoC samples)
// Phase 2 verification scaffolding — remove after Phase 4 LangGraph swap lands.
// Do NOT edit by hand. Re-run the generator to refresh.
import type { AgentCreateLayerCommand } from '../model/contracts';

export interface V6Fixture {
  readonly label: string;
  readonly canvas: { readonly width: number; readonly height: number };
  readonly commands: ReadonlyArray<AgentCreateLayerCommand>;
}

export const V6_FIXTURES: ReadonlyArray<V6Fixture> = ${JSON.stringify(fixtures, null, 2)};
`;
  return header;
}

function main() {
  const files = readdirSync(COMMANDS_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort();
  const fixtures = [];
  for (const f of files) {
    const full = join(COMMANDS_DIR, f);
    const poc = JSON.parse(readFileSync(full, 'utf8'));
    fixtures.push({
      label: sampleLabel(f),
      canvas: poc.canvas,
      commands: adaptPoc(poc),
    });
  }
  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, render(fixtures));
  console.log(`wrote ${OUTPUT_PATH} with ${fixtures.length} fixtures`);
  for (const f of fixtures) {
    console.log(`  ${f.label}: ${f.commands.length} commands, canvas ${f.canvas.width}×${f.canvas.height}`);
  }
}

main();
