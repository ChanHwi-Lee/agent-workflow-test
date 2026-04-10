import { TooldiCatalogSourceError } from "@tooldi/tool-adapters";

import { SpringCatalogActivationError } from "../phases/assembleTemplateCandidates.js";

export function isSpringActivationFailure(
  error: unknown,
): error is TooldiCatalogSourceError | SpringCatalogActivationError {
  return (
    error instanceof TooldiCatalogSourceError ||
    error instanceof SpringCatalogActivationError
  );
}

export function getSpringActivationErrorCode(
  error: TooldiCatalogSourceError | SpringCatalogActivationError,
): string {
  if (error instanceof TooldiCatalogSourceError) {
    return `catalog_source_${error.code}`;
  }
  return error.code;
}

export function shouldStopAfterCurrentAction(response: {
  cancelRequested: boolean;
  stopAfterCurrentAction: boolean;
}): boolean {
  return response.cancelRequested || response.stopAfterCurrentAction;
}
