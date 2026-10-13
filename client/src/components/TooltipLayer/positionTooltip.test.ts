import assert from "node:assert/strict";
import test from "node:test";

import { positionTooltip, type TooltipPlacement } from "./positionTooltip";

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    x: left,
    y: top,
    top,
    right: left + width,
    bottom: top + height,
    left,
    width,
    height,
    toJSON: () => ({}),
  };
}

function place(
  anchor: DOMRect,
  preferredPlacement: TooltipPlacement,
  obstacles: DOMRect[] = [],
) {
  return positionTooltip({
    anchor,
    tooltip: { width: 110, height: 36 },
    viewport: { width: 360, height: 240 },
    preferredPlacement,
    align: "end",
    obstacles,
    distance: 11,
    viewportPadding: 8,
    arrowInset: 16,
  });
}

test("uses the opposite direction when the preferred side is outside the viewport", () => {
  assert.equal(place(rect(290, 8, 30, 30), "top").placement, "bottom");
  assert.equal(place(rect(290, 202, 30, 30), "bottom").placement, "top");
});

test("avoids a neighboring interactive element when another side is clear", () => {
  const anchor: DOMRect = rect(290, 90, 30, 30);
  const nextChat: DOMRect = rect(0, 125, 340, 48);

  assert.equal(place(anchor, "bottom", [nextChat]).placement, "top");
});

test("keeps the bubble inside the viewport and the arrow aimed at its anchor", () => {
  const result = place(rect(338, 100, 20, 30), "top");

  assert.ok(result.x >= 8);
  assert.ok(result.x + 110 <= 352);
  assert.ok(result.arrow.x >= 16);
  assert.ok(result.arrow.x <= 94);
});
