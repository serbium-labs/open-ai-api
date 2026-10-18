export const MOBILE_BREAKPOINT_PX: number = 848;
export const MOBILE_MEDIA_QUERY: string = `(max-width: ${MOBILE_BREAKPOINT_PX}px)`;
export const SIDEBAR_PREFERENCES_STORAGE_KEY: string = "sidebarPreferences";

export interface SidebarPreferences {
  isChatHistoryOpen: boolean;
  isResourcesOpen: boolean;
}

export interface SidebarState {
  isChatHistoryOpen: boolean;
  isResourcesOpen: boolean;
  isMobile: boolean;
  preferences: SidebarPreferences;
}

interface SidebarPreferenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export type SidebarAction =
  | { type: "toggleChatHistory" }
  | { type: "toggleResources" }
  | { type: "viewportChanged"; isMobile: boolean };

const DEFAULT_SIDEBAR_PREFERENCES: SidebarPreferences = {
  isChatHistoryOpen: true,
  isResourcesOpen: false,
};

function visibleSidebars(
  preferences: SidebarPreferences,
  isMobile: boolean,
): Pick<SidebarState, "isChatHistoryOpen" | "isResourcesOpen"> {
  if (!isMobile) {
    return preferences;
  }

  return {
    isChatHistoryOpen: preferences.isChatHistoryOpen,
    isResourcesOpen: !preferences.isChatHistoryOpen && preferences.isResourcesOpen,
  };
}

export function loadSidebarPreferences(
  storage: SidebarPreferenceStorage | undefined,
): SidebarPreferences {
  if (storage === undefined) {
    return { ...DEFAULT_SIDEBAR_PREFERENCES };
  }

  try {
    const storedValue: unknown = JSON.parse(
      storage.getItem(SIDEBAR_PREFERENCES_STORAGE_KEY) ?? "null",
    );

    if (
      typeof storedValue === "object" &&
      storedValue !== null &&
      "isChatHistoryOpen" in storedValue &&
      typeof storedValue.isChatHistoryOpen === "boolean" &&
      "isResourcesOpen" in storedValue &&
      typeof storedValue.isResourcesOpen === "boolean"
    ) {
      return {
        isChatHistoryOpen: storedValue.isChatHistoryOpen,
        isResourcesOpen: storedValue.isResourcesOpen,
      };
    }
  } catch {
    // Storage can be unavailable or contain invalid data. Use stable defaults in either case.
  }

  return { ...DEFAULT_SIDEBAR_PREFERENCES };
}

export function saveSidebarPreferences(
  storage: SidebarPreferenceStorage | undefined,
  preferences: SidebarPreferences,
): void {
  try {
    storage?.setItem(SIDEBAR_PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // Sidebar controls should continue to work when storage is unavailable.
  }
}

export function createInitialSidebarState(
  isMobile: boolean,
  preferences: SidebarPreferences = DEFAULT_SIDEBAR_PREFERENCES,
): SidebarState {
  return {
    ...visibleSidebars(preferences, isMobile),
    isMobile,
    preferences: { ...preferences },
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
        preferences: {
          ...state.preferences,
          isChatHistoryOpen,
        },
      };
    }
    case "toggleResources": {
      const isResourcesOpen: boolean = !state.isResourcesOpen;

      return {
        ...state,
        isChatHistoryOpen: isResourcesOpen && state.isMobile ? false : state.isChatHistoryOpen,
        isResourcesOpen,
        preferences: {
          ...state.preferences,
          isResourcesOpen,
        },
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
        ...visibleSidebars(state.preferences, action.isMobile),
        isMobile: action.isMobile,
      };
    }
  }
}
