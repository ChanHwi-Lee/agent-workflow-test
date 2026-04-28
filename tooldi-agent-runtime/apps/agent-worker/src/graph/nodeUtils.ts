export function shouldStopAfterCurrentAction(response: {
  cancelRequested: boolean;
  stopAfterCurrentAction: boolean;
}): boolean {
  return response.cancelRequested || response.stopAfterCurrentAction;
}
