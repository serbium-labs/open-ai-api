import assert from "node:assert/strict";
import test from "node:test";

import {
  getChatHistoryTooltipPosition,
  getResourcesTooltipPosition,
} from "./sidebarTooltips";

test("keeps closed sidebar tooltips pointed into the viewport", () => {
  assert.deepEqual(getChatHistoryTooltipPosition(false, false), { placement: "right" });
  assert.deepEqual(getResourcesTooltipPosition(false, false), { placement: "left" });
});

test("points close tooltips into their open sidebar", () => {
  assert.deepEqual(getChatHistoryTooltipPosition(true, false), { placement: "left" });
  assert.deepEqual(getResourcesTooltipPosition(true, false), { placement: "right" });
});

test("places the opposite open tooltip below adjacent sidebar controls", () => {
  assert.deepEqual(getChatHistoryTooltipPosition(false, true), {
    placement: "bottom",
    align: "start",
  });
  assert.deepEqual(getResourcesTooltipPosition(false, true), {
    placement: "bottom",
    align: "end",
  });
});
