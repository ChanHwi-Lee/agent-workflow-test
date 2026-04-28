import { TooldiCatalogSourceError } from "@tooldi/tool-adapters";

export function isSpringActivationFailure(
  error: unknown,
): error is TooldiCatalogSourceError {
  return error instanceof TooldiCatalogSourceError;
}

export function getSpringActivationErrorCode(
  error: TooldiCatalogSourceError,
): string {
  return `catalog_source_${error.code}`;
}

export function shouldStopAfterCurrentAction(response: {
  cancelRequested: boolean;
  stopAfterCurrentAction: boolean;
}): boolean {
  return response.cancelRequested || response.stopAfterCurrentAction;
}
