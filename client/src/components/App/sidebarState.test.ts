import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  createInitialSidebarState,
  MOBILE_MEDIA_QUERY,
  reduceSidebarState,
  type SidebarState,
} from "./sidebarState";

test("uses the same 640px mobile breakpoint as the stylesheet", () => {
  const stylesheet: string = readFileSync(new URL("../../styles.css", import.meta.url), "utf8");

  assert.equal(MOBILE_MEDIA_QUERY, "(max-width: 640px)");
  assert.match(stylesheet, /@media \(max-width: 640px\)/);
});

test("desktop allows both sidebars to be open", () => {
  const initialState: SidebarState = createInitialSidebarState(false);
  const state: SidebarState = reduceSidebarState(initialState, { type: "toggleResources" });

  assert.equal(state.isChatHistoryOpen, true);
  assert.equal(state.isResourcesOpen, true);
});

test("resizing from desktop to mobile closes resources when both sidebars are open", () => {
  const desktopState: SidebarState = {
    isChatHistoryOpen: true,
    isResourcesOpen: true,
    isMobile: false,
  };
  const state: SidebarState = reduceSidebarState(desktopState, {
    type: "viewportChanged",
    isMobile: true,
  });

  assert.equal(state.isMobile, true);
  assert.equal(state.isChatHistoryOpen, true);
  assert.equal(state.isResourcesOpen, false);
});

test("resizing to mobile keeps resources open when history is closed", () => {
  const desktopState: SidebarState = {
    isChatHistoryOpen: false,
    isResourcesOpen: true,
    isMobile: false,
  };
  const state: SidebarState = reduceSidebarState(desktopState, {
    type: "viewportChanged",
    isMobile: true,
  });

  assert.equal(state.isChatHistoryOpen, false);
  assert.equal(state.isResourcesOpen, true);
});

test("mobile toggles switch between sidebars without overlap", () => {
  const initialState: SidebarState = createInitialSidebarState(true);
  const resourcesState: SidebarState = reduceSidebarState(initialState, { type: "toggleResources" });
  const historyState: SidebarState = reduceSidebarState(resourcesState, { type: "toggleChatHistory" });

  assert.deepEqual(resourcesState, {
    isChatHistoryOpen: false,
    isResourcesOpen: true,
    isMobile: true,
  });
  assert.deepEqual(historyState, {
    isChatHistoryOpen: true,
    isResourcesOpen: false,
    isMobile: true,
  });
});
