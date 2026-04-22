// AGW v6 — shared types for the browser-based extraction pipeline.
//
// Philosophy lock:
//   - 시스템이 layout family 를 정의하지 않는다.
//   - Slot / topology / CTA / role 을 contract 로 올리지 않는다.
//   - LLM 은 결과를 만든다. 브라우저는 layout 을 계산한다. 코드는 결과를 추출한다.
//
// These types are the v6 internal representation. Mapping to the canonical
// `@tooldi/agent-contracts` Canvas Mutation Protocol happens downstream in
// Phase 4 Integration and must remain lossless for primitives the contract
// understands; richer primitives (bitmap/svg/multi-stop gradient) require
// contract extension in Phase 2.

export interface V6Canvas {
  readonly width: number;
  readonly height: number;
}

export interface V6Bounds {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface V6ComputedStyle {
  readonly backgroundColor: string;
  readonly backgroundImage: string;
  readonly borderTopLeftRadius: string;
  readonly borderTopRightRadius: string;
  readonly borderBottomRightRadius: string;
  readonly borderBottomLeftRadius: string;
  readonly borderTopWidth: string;
  readonly borderRightWidth: string;
  readonly borderBottomWidth: string;
  readonly borderLeftWidth: string;
  readonly borderTopColor: string;
  readonly paddingTop: string;
  readonly paddingRight: string;
  readonly paddingBottom: string;
  readonly paddingLeft: string;
  readonly color: string;
  readonly fontFamily: string;
  readonly fontSize: string;
  readonly fontWeight: string;
  readonly fontStyle: string;
  readonly textDecorationLine: string;
  readonly textAlign: string;
  readonly lineHeight: string;
  readonly letterSpacing: string;
  readonly opacity: string;
  readonly transform: string;
  readonly transformOrigin: string;
  readonly boxShadow: string;
  readonly objectFit: string;
  readonly overflow: string;
  readonly display: string;
  readonly visibility: string;
  readonly whiteSpace: string;
}

export interface V6RenderedImage {
  readonly src: string;
  readonly naturalWidth: number;
  readonly naturalHeight: number;
  readonly alt: string;
}

export interface V6RenderedSvg {
  readonly outerHTML: string;
}

export interface V6RenderedElementLayout {
  readonly clientWidth: number;
  readonly clientHeight: number;
  readonly scrollWidth: number;
  readonly scrollHeight: number;
}

export interface V6RenderedElement {
  readonly serial: number;
  readonly path: string;
  readonly tagName: string;
  readonly bounds: V6Bounds;
  readonly style: V6ComputedStyle;
  readonly isTextLeaf: boolean;
  readonly text: string | null;
  readonly img: V6RenderedImage | null;
  readonly svg: V6RenderedSvg | null;
  readonly hasChildren: boolean;
  readonly visible: boolean;
  readonly layout?: V6RenderedElementLayout | null;
}

export interface V6ExtractionResult {
  readonly canvas: V6Canvas;
  readonly elements: ReadonlyArray<V6RenderedElement>;
}

export interface V6GradientStop {
  readonly color: string;
  readonly offset: number;
}

export interface V6LinearGradient {
  readonly type: "linear-gradient";
  readonly angle: number;
  readonly stops: ReadonlyArray<V6GradientStop>;
}

export type V6Fill = string | V6LinearGradient | null;

export type V6BorderRadius = number | readonly [number, number, number, number];

export interface V6Stroke {
  readonly color: string;
  readonly width: number;
}

export interface V6SourceRef {
  readonly serial: number;
  readonly path: string;
  readonly tag: string;
}

interface V6BaseCommand {
  readonly type: "create";
  readonly source: V6SourceRef;
  readonly bounds: V6Bounds;
  readonly opacity: number;
  readonly transform?: string;
}

export interface V6RectCommand extends V6BaseCommand {
  readonly primitive: "rect";
  readonly fill: V6Fill;
  readonly borderRadius: V6BorderRadius;
  readonly stroke: V6Stroke | null;
  readonly shadow: string | null;
}

export interface V6TextCommand extends V6BaseCommand {
  readonly primitive: "text";
  readonly text: string;
  readonly fontFamily: string;
  readonly fontSize: number;
  readonly fontWeight: string;
  readonly fontStyle: string;
  readonly textDecoration: string;
  readonly textAlign: string;
  readonly lineHeight: number | "normal";
  readonly letterSpacing: number;
  readonly color: string;
}

export interface V6ImageCommand extends V6BaseCommand {
  readonly primitive: "image" | "bitmap";
  readonly src: string;
  readonly naturalWidth: number;
  readonly naturalHeight: number;
  readonly objectFit: string;
  readonly borderRadius: V6BorderRadius;
  readonly alt: string;
  readonly resolvedAssetId?: string;
  readonly resolvedAssetFamily?: "photo" | "graphic";
  readonly resolvedAssetSourceSerial?: number;
  readonly resolvedAssetOriginKey?: string;
  readonly resolvedAssetThumbKey?: string;
  readonly resolvedAssetMethod?: string;
  readonly unresolvedPlaceholder?: boolean;
  readonly placeholderUri?: string;
  readonly placeholderHint?: string;
  readonly unresolveReason?: string;
}

export interface V6SvgCommand extends V6BaseCommand {
  readonly primitive: "svg";
  readonly outerHTML: string;
}

export type V6PrimitiveCommand =
  | V6RectCommand
  | V6TextCommand
  | V6ImageCommand
  | V6SvgCommand;

export interface V6MappingResult {
  readonly canvas: V6Canvas;
  readonly commands: ReadonlyArray<V6PrimitiveCommand>;
}
