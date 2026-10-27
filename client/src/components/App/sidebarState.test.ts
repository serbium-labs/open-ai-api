import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  createInitialSidebarState,
  loadSidebarPreferences,
  MOBILE_MEDIA_QUERY,
  reduceSidebarState,
  saveSidebarPreferences,
  SIDEBAR_PREFERENCES_STORAGE_KEY,
  type SidebarPreferences,
  type SidebarState,
} from "./sidebarState";

test("uses the same collision-free sidebar breakpoint as the stylesheet", () => {
  const stylesheet: string = readFileSync(new URL("../../styles.css", import.meta.url), "utf8");

  assert.equal(MOBILE_MEDIA_QUERY, "(max-width: 848px)");
  assert.match(stylesheet, /@media \(max-width: 848px\)/);
  assert.match(stylesheet, /--sidebar-width: min\(calc\(100vw - 104px\), 360px\)/);
});

test("desktop allows both user-selected sidebars to be open", () => {
  const initialState: SidebarState = createInitialSidebarState(false);
  const state: SidebarState = reduceSidebarState(initialState, { type: "toggleResources" });

  assert.equal(state.isChatHistoryOpen, true);
  assert.equal(state.isResourcesOpen, true);
  assert.deepEqual(state.preferences, {
    isChatHistoryOpen: true,
    isResourcesOpen: true,
  });
});

test("responsive transitions restore desktop preferences after temporary mobile adaptation", () => {
  const preferences: SidebarPreferences = {
    isChatHistoryOpen: true,
    isResourcesOpen: true,
  };
  const desktopState: SidebarState = createInitialSidebarState(false, preferences);
  const mobileState: SidebarState = reduceSidebarState(desktopState, {
    type: "viewportChanged",
    isMobile: true,
  });
  const restoredState: SidebarState = reduceSidebarState(mobileState, {
    type: "viewportChanged",
    isMobile: false,
  });

  assert.deepEqual(mobileState, {
    isChatHistoryOpen: true,
    isResourcesOpen: false,
    isMobile: true,
    preferences,
  });
  assert.deepEqual(restoredState, {
    isChatHistoryOpen: true,
    isResourcesOpen: true,
    isMobile: false,
    preferences,
  });
});

test("resizing to mobile keeps resources open when history is not preferred", () => {
  const preferences: SidebarPreferences = {
    isChatHistoryOpen: false,
    isResourcesOpen: true,
  };
  const desktopState: SidebarState = createInitialSidebarState(false, preferences);
  const state: SidebarState = reduceSidebarState(desktopState, {
    type: "viewportChanged",
    isMobile: true,
  });

  assert.equal(state.isChatHistoryOpen, false);
  assert.equal(state.isResourcesOpen, true);
  assert.deepEqual(state.preferences, preferences);
});

test("mobile toggles switch between sidebars without discarding the other preference", () => {
  const initialState: SidebarState = createInitialSidebarState(true);
  const resourcesState: SidebarState = reduceSidebarState(initialState, { type: "toggleResources" });
  const historyState: SidebarState = reduceSidebarState(resourcesState, { type: "toggleChatHistory" });

  assert.deepEqual(resourcesState, {
    isChatHistoryOpen: false,
    isResourcesOpen: true,
    isMobile: true,
    preferences: {
      isChatHistoryOpen: true,
      isResourcesOpen: true,
    },
  });
  assert.deepEqual(historyState, {
    isChatHistoryOpen: true,
    isResourcesOpen: false,
    isMobile: true,
    preferences: {
      isChatHistoryOpen: true,
      isResourcesOpen: true,
    },
  });
});

test("mobile never shows both sidebars", () => {
  let state: SidebarState = createInitialSidebarState(true, {
    isChatHistoryOpen: true,
    isResourcesOpen: true,
  });

  for (const action of [
    { type: "toggleResources" } as const,
    { type: "toggleChatHistory" } as const,
    { type: "toggleChatHistory" } as const,
    { type: "toggleResources" } as const,
  ]) {
    state = reduceSidebarState(state, action);
    assert.equal(state.isChatHistoryOpen && state.isResourcesOpen, false);
  }
});

test("a repeated mobile viewport update repairs overlapping visibility", () => {
  const invalidState: SidebarState = {
    isChatHistoryOpen: true,
    isResourcesOpen: true,
    isMobile: true,
    preferences: {
      isChatHistoryOpen: true,
      isResourcesOpen: true,
    },
  };
  const state: SidebarState = reduceSidebarState(invalidState, {
    type: "viewportChanged",
    isMobile: true,
  });

  assert.equal(state.isChatHistoryOpen, true);
  assert.equal(state.isResourcesOpen, false);
});

test("saved preferences are restored across initialization", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string): string | null => values.get(key) ?? null,
    setItem: (key: string, value: string): void => {
      values.set(key, value);
    },
  };
  const preferences: SidebarPreferences = {
    isChatHistoryOpen: false,
    isResourcesOpen: true,
  };

  saveSidebarPreferences(storage, preferences);

  assert.equal(values.has(SIDEBAR_PREFERENCES_STORAGE_KEY), true);
  assert.deepEqual(loadSidebarPreferences(storage), preferences);
  assert.deepEqual(createInitialSidebarState(false, loadSidebarPreferences(storage)), {
    isChatHistoryOpen: false,
    isResourcesOpen: true,
    isMobile: false,
    preferences,
  });
});

test("invalid or unavailable storage safely falls back to defaults", () => {
  const unavailableStorage = {
    getItem: (): string | null => {
      throw new Error("Storage unavailable");
    },
    setItem: (): void => {
      throw new Error("Storage unavailable");
    },
  };
  const invalidStorage = {
    getItem: (): string => '{"isChatHistoryOpen":"yes"}',
    setItem: (): void => undefined,
  };

  assert.doesNotThrow(() =>
    saveSidebarPreferences(unavailableStorage, {
      isChatHistoryOpen: false,
      isResourcesOpen: true,
    }),
  );
  assert.deepEqual(loadSidebarPreferences(unavailableStorage), {
    isChatHistoryOpen: true,
    isResourcesOpen: false,
  });
  assert.deepEqual(loadSidebarPreferences(invalidStorage), {
    isChatHistoryOpen: true,
    isResourcesOpen: false,
  });
  assert.deepEqual(loadSidebarPreferences(undefined), {
    isChatHistoryOpen: true,
    isResourcesOpen: false,
  });
});
