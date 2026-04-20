export interface LinearGradientParse {
  readonly type: "linear";
  readonly angle: number;
  readonly startColor: string;
  readonly endColor: string;
}

const COLOR_PREFIX = /^(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)|hsla?\([^)]+\)|[a-zA-Z]+)/;

export function parseLinearGradient(
  value: string | undefined | null,
): LinearGradientParse | null {
  if (!value) return null;
  const outer = value.trim().match(/^linear-gradient\s*\(([\s\S]*)\)\s*$/i);
  if (!outer || outer[1] === undefined) return null;
  const parts = splitTopLevelCommas(outer[1]);
  if (parts.length < 2) return null;
  let angle = 180;
  let segments = parts.map((s) => s.trim());
  const head = segments[0];
  if (head === undefined) return null;
  const angleMatch = head.match(/^(-?\d+(?:\.\d+)?)\s*deg$/i);
  if (angleMatch && angleMatch[1] !== undefined) {
    angle = Number.parseFloat(angleMatch[1]);
    segments = segments.slice(1);
  } else if (/^to\s+/i.test(head)) {
    angle = directionToAngle(head.toLowerCase());
    segments = segments.slice(1);
  }
  if (segments.length < 2) return null;
  const firstSegment = segments[0];
  const lastSegment = segments[segments.length - 1];
  if (firstSegment === undefined || lastSegment === undefined) return null;
  const start = extractColor(firstSegment);
  const end = extractColor(lastSegment);
  if (!start || !end) return null;
  return { type: "linear", angle, startColor: start, endColor: end };
}

function splitTopLevelCommas(body: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let buf = "";
  for (const ch of body) {
    if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    if (ch === "," && depth === 0) {
      out.push(buf);
      buf = "";
      continue;
    }
    buf += ch;
  }
  if (buf) out.push(buf);
  return out;
}

function directionToAngle(direction: string): number {
  if (direction.includes("top right")) return 45;
  if (direction.includes("bottom right")) return 135;
  if (direction.includes("bottom left")) return 225;
  if (direction.includes("top left")) return 315;
  if (direction.includes("right")) return 90;
  if (direction.includes("bottom")) return 180;
  if (direction.includes("left")) return 270;
  return 0;
}

function extractColor(segment: string): string | null {
  const trimmed = segment.trim();
  const match = trimmed.match(COLOR_PREFIX);
  return match && match[1] !== undefined ? match[1] : null;
}
