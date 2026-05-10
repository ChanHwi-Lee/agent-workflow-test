import { Type, type Static } from "@sinclair/typebox";

// 실제 워커 emit kind 8종 + RAG capture 신규 2종 = 10종
export const AdminArtifactKindValues = [
  "brief-compilation-report",
  "canonical-design-brief",
  "v6-trend-brief",
  "v6-render-quality-report",
  "v6-render-quality-failure",
  "debug-v6-html-preview",
  "debug-unrestricted-html-preview",
  "executable-plan",
  "v6-asset-resolution",
  "v6-asset-generated",
] as const;

export const AdminArtifactKindSchema = Type.Union(
  AdminArtifactKindValues.map((v) => Type.Literal(v)),
);
export type AdminArtifactKind = Static<typeof AdminArtifactKindSchema>;

export const AdminArtifactFilenameByKind: Record<AdminArtifactKind, string> = {
  "brief-compilation-report":          "brief-compilation-report.json",
  "canonical-design-brief":            "canonical-design-brief.json",
  "v6-trend-brief":                    "v6-trend-brief.json",
  "v6-render-quality-report":          "v6-render-quality-report.json",
  "v6-render-quality-failure":         "v6-render-quality-failure.json",
  "debug-v6-html-preview":             "debug-v6-html.json",
  "debug-unrestricted-html-preview":   "debug-unrestricted-html.json",
  "executable-plan":                   "executable-plan.json",
  "v6-asset-resolution":               "v6-asset-resolution.json",
  "v6-asset-generated":                "v6-asset-generated.json",
};
