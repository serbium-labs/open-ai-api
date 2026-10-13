export type TooltipPlacement = "top" | "bottom" | "left" | "right";

export interface TooltipPoint {
  x: number;
  y: number;
}

export interface TooltipPosition extends TooltipPoint {
  arrow: TooltipPoint;
  placement: TooltipPlacement;
}

interface TooltipSize {
  width: number;
  height: number;
}

interface ViewportSize {
  width: number;
  height: number;
}

interface PositionTooltipOptions {
  anchor: DOMRect;
  tooltip: TooltipSize;
  viewport: ViewportSize;
  preferredPlacement: TooltipPlacement;
  align: "center" | "end";
  obstacles: DOMRect[];
  distance: number;
  viewportPadding: number;
  arrowInset: number;
}

interface Candidate {
  placement: TooltipPlacement;
  x: number;
  y: number;
  score: number;
}

const PLACEMENTS: TooltipPlacement[] = ["top", "bottom", "left", "right"];

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

function intersectionArea(left: DOMRect, right: DOMRect): number {
  const width: number = Math.max(0, Math.min(left.right, right.right) - Math.max(left.left, right.left));
  const height: number = Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top));

  return width * height;
}

function rectAt(x: number, y: number, size: TooltipSize): DOMRect {
  return {
    x,
    y,
    top: y,
    right: x + size.width,
    bottom: y + size.height,
    left: x,
    width: size.width,
    height: size.height,
    toJSON: () => ({}),
  };
}

function rawPosition(
  placement: TooltipPlacement,
  anchor: DOMRect,
  tooltip: TooltipSize,
  distance: number,
  align: "center" | "end",
): TooltipPoint {
  const centeredX: number = anchor.left + (anchor.width - tooltip.width) / 2;
  const centeredY: number = anchor.top + (anchor.height - tooltip.height) / 2;
  const alignedX: number = align === "end" ? anchor.right - tooltip.width : centeredX;

  switch (placement) {
    case "top":
      return { x: alignedX, y: anchor.top - tooltip.height - distance };
    case "bottom":
      return { x: alignedX, y: anchor.bottom + distance };
    case "left":
      return { x: anchor.left - tooltip.width - distance, y: centeredY };
    case "right":
      return { x: anchor.right + distance, y: centeredY };
  }
}

function placementOrder(preferredPlacement: TooltipPlacement): TooltipPlacement[] {
  const opposite: Record<TooltipPlacement, TooltipPlacement> = {
    top: "bottom",
    bottom: "top",
    left: "right",
    right: "left",
  };

  return [
    preferredPlacement,
    opposite[preferredPlacement],
    ...PLACEMENTS.filter(
      (placement: TooltipPlacement) =>
        placement !== preferredPlacement && placement !== opposite[preferredPlacement],
    ),
  ];
}

export function positionTooltip({
  anchor,
  tooltip,
  viewport,
  preferredPlacement,
  align,
  obstacles,
  distance,
  viewportPadding,
  arrowInset,
}: PositionTooltipOptions): TooltipPosition {
  const maximumX: number = viewport.width - viewportPadding - tooltip.width;
  const maximumY: number = viewport.height - viewportPadding - tooltip.height;
  const order: TooltipPlacement[] = placementOrder(preferredPlacement);
  const candidates: Candidate[] = order.map((placement: TooltipPlacement, index: number) => {
    const raw: TooltipPoint = rawPosition(placement, anchor, tooltip, distance, align);
    const x: number = clamp(raw.x, viewportPadding, maximumX);
    const y: number = clamp(raw.y, viewportPadding, maximumY);
    const rect: DOMRect = rectAt(x, y, tooltip);
    const displacement: number = Math.abs(x - raw.x) + Math.abs(y - raw.y);
    const obstacleArea: number = obstacles.reduce(
      (total: number, obstacle: DOMRect) => total + intersectionArea(rect, obstacle),
      0,
    );
    const anchorArea: number = intersectionArea(rect, anchor);

    // Intersections dominate preference. Displacement penalizes placements that only
    // fit after being pushed away from their anchor by a viewport edge.
    const score: number = anchorArea * 10_000 + obstacleArea * 100 + displacement * 10 + index;

    return { placement, x, y, score };
  });
  const best: Candidate = candidates.reduce((current: Candidate, candidate: Candidate) =>
    candidate.score < current.score ? candidate : current,
  );
  const anchorCenterX: number = anchor.left + anchor.width / 2;
  const anchorCenterY: number = anchor.top + anchor.height / 2;

  return {
    x: best.x,
    y: best.y,
    placement: best.placement,
    arrow: {
      x: clamp(anchorCenterX - best.x, arrowInset, tooltip.width - arrowInset),
      y: clamp(anchorCenterY - best.y, arrowInset, tooltip.height - arrowInset),
    },
  };
}
