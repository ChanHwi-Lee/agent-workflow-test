export const tooldiCatalogSourceModes = [
  "placeholder",
  "tooldi_api",
  "tooldi_api_direct",
] as const;

export type TooldiCatalogSourceMode =
  (typeof tooldiCatalogSourceModes)[number];

export interface TooldiTemplateDocumentPage {
  index: number;
  raw: string;
  pattern: Record<string, unknown> | null;
  parsed: Record<string, unknown> | null;
}

export interface TooldiTemplateDocument {
  code: string;
  metaData: {
    code: string;
    innerCode: string;
    title: string;
    width: string;
    height: string;
    sizeUnit: "px" | "mm" | "cm" | "inch" | string;
    isShare: boolean;
    userId: string;
    createdAt: string;
    modifiedAt: string;
    keyword: string;
  };
  canvas: {
    serial: string;
    title: string;
    width: string;
    height: string;
    sizeUnit: "px" | "mm" | "cm" | "inch" | string;
  };
  pages: TooldiTemplateDocumentPage[];
}

export type TooldiCatalogSourceErrorCode =
  | "request_failed"
  | "timeout"
  | "invalid_response";
