type NavigableResource = { id: string; messageId: string };

export type ResourceNavigationTarget = {
  resourceId: string;
  messageId: string;
  requestId: number;
};

export type TranscriptScrollMetrics = {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  containerTop: number;
  targetTop: number;
  targetHeight: number;
};

export function resolveResourceNavigation(
  resources: NavigableResource[],
  resourceId: string,
  requestId: number,
): ResourceNavigationTarget | undefined {
  const resource: NavigableResource | undefined = resources.find(
    (candidate: NavigableResource) => candidate.id === resourceId,
  );

  if (resource === undefined) {
    return undefined;
  }

  return {
    resourceId: resource.id,
    messageId: resource.messageId,
    requestId,
  };
}

export function getHighlightedMessageId(
  target: ResourceNavigationTarget | undefined,
  messageIds: Iterable<string>,
): string | undefined {
  if (target === undefined) {
    return undefined;
  }

  return new Set(messageIds).has(target.messageId) ? target.messageId : undefined;
}

export function getTranscriptScrollTop(metrics: TranscriptScrollMetrics): number {
  const centeredTop: number =
    metrics.scrollTop +
    metrics.targetTop -
    metrics.containerTop -
    (metrics.clientHeight - metrics.targetHeight) / 2;
  const maximumScrollTop: number = Math.max(0, metrics.scrollHeight - metrics.clientHeight);

  return Math.min(maximumScrollTop, Math.max(0, centeredTop));
}
