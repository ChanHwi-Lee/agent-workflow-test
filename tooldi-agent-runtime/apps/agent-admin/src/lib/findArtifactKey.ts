import type {
  AdminArtifactKind,
  ArtifactRef,
} from "@tooldi/agent-contracts";

/**
 * 상세 페이지에서 `kind` 의 첫 번째 존재하는 artifact 의 object-store key 를
 * 찾아준다. §F · §G · §H 가 동일 패턴(`detail.artifactRefs.find(...).key`) 을
 * 반복 사용하므로 한 곳에 모아둔다.
 */
export function findArtifactKey(
  refs: ReadonlyArray<ArtifactRef>,
  kind: AdminArtifactKind,
): string | null {
  return refs.find((r) => r.kind === kind && r.exists)?.key ?? null;
}
