export const MOBILE_BREAKPOINT_PX: number = 640;
export const MOBILE_MEDIA_QUERY: string = `(max-width: ${MOBILE_BREAKPOINT_PX}px)`;

export interface SidebarState {
  isChatHistoryOpen: boolean;
  isResourcesOpen: boolean;
  isMobile: boolean;
}

export type SidebarAction =
  | { type: "toggleChatHistory" }
  | { type: "toggleResources" }
  | { type: "viewportChanged"; isMobile: boolean };

export function createInitialSidebarState(isMobile: boolean): SidebarState {
  return {
    isChatHistoryOpen: true,
    isResourcesOpen: false,
    isMobile,
  };
}

export function reduceSidebarState(state: SidebarState, action: SidebarAction): SidebarState {
  switch (action.type) {
    case "toggleChatHistory": {
      const isChatHistoryOpen: boolean = !state.isChatHistoryOpen;

      return {
        ...state,
        isChatHistoryOpen,
        isResourcesOpen: isChatHistoryOpen && state.isMobile ? false : state.isResourcesOpen,
      };
    }
    case "toggleResources": {
      const isResourcesOpen: boolean = !state.isResourcesOpen;

      return {
        ...state,
        isChatHistoryOpen: isResourcesOpen && state.isMobile ? false : state.isChatHistoryOpen,
        isResourcesOpen,
      };
    }
    case "viewportChanged": {
      if (
        action.isMobile === state.isMobile &&
        !(action.isMobile && state.isChatHistoryOpen && state.isResourcesOpen)
      ) {
        return state;
      }

      return {
        ...state,
        isMobile: action.isMobile,
        isResourcesOpen:
          action.isMobile && state.isChatHistoryOpen ? false : state.isResourcesOpen,
      };
    }
  }
}
