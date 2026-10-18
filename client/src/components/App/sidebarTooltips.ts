export type SidebarTooltipPlacement = "bottom" | "left" | "right";
export type SidebarTooltipAlign = "start" | "end" | undefined;

export interface SidebarTooltipPosition {
  placement: SidebarTooltipPlacement;
  align?: SidebarTooltipAlign;
}

export function getChatHistoryTooltipPosition(
  isChatHistoryOpen: boolean,
  isResourcesOpen: boolean,
): SidebarTooltipPosition {
  if (isChatHistoryOpen) {
    return { placement: "left" };
  }

  if (isResourcesOpen) {
    return { placement: "bottom", align: "start" };
  }

  return { placement: "right" };
}

export function getResourcesTooltipPosition(
  isResourcesOpen: boolean,
  isChatHistoryOpen: boolean,
): SidebarTooltipPosition {
  if (isResourcesOpen) {
    return { placement: "right" };
  }

  if (isChatHistoryOpen) {
    return { placement: "bottom", align: "end" };
  }

  return { placement: "left" };
}
