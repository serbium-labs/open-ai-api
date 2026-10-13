import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
} from "react";
import { createPortal } from "react-dom";

import { positionTooltip, type TooltipPlacement, type TooltipPosition } from "./positionTooltip";

interface ActiveTooltip {
  anchor: HTMLElement;
  text: string;
  preferredPlacement: TooltipPlacement;
  align: "center" | "end";
}

interface TooltipCustomProperties extends CSSProperties {
  "--tooltip-arrow-x": string;
  "--tooltip-arrow-y": string;
}

const INTERACTIVE_SELECTOR: string = [
  "button",
  "a[href]",
  "input",
  "textarea",
  "select",
  "[role='button']",
  ".chat-history-item",
  ".prompt-form",
].join(",");

const VALID_PLACEMENTS: TooltipPlacement[] = ["top", "bottom", "left", "right"];

function tooltipTrigger(target: EventTarget | null): HTMLElement | null {
  return target instanceof Element ? target.closest<HTMLElement>("[data-tooltip]") : null;
}

function activeTooltipFor(anchor: HTMLElement): ActiveTooltip | null {
  const text: string | undefined = anchor.dataset.tooltip;

  if (text === undefined || text.trim() === "") {
    return null;
  }

  const requestedPlacement: string | undefined = anchor.dataset.tooltipPlacement;
  const preferredPlacement: TooltipPlacement = VALID_PLACEMENTS.includes(
    requestedPlacement as TooltipPlacement,
  )
    ? (requestedPlacement as TooltipPlacement)
    : "top";

  return {
    anchor,
    text,
    preferredPlacement,
    align: anchor.dataset.tooltipAlign === "end" ? "end" : "center",
  };
}

function cssPixels(styles: CSSStyleDeclaration, property: string, fallback: number): number {
  const value: number = Number.parseFloat(styles.getPropertyValue(property));
  return Number.isFinite(value) ? value : fallback;
}

function visibleObstacles(anchor: HTMLElement): DOMRect[] {
  const anchorItem: Element | null = anchor.closest(".chat-history-item");

  return Array.from(document.querySelectorAll<HTMLElement>(INTERACTIVE_SELECTOR))
    .filter((element: HTMLElement) => {
      if (element === anchor || element.contains(anchor) || anchor.contains(element)) {
        return false;
      }

      if (anchorItem !== null && element === anchorItem) {
        return false;
      }

      const styles: CSSStyleDeclaration = window.getComputedStyle(element);
      return styles.display !== "none" && styles.visibility !== "hidden";
    })
    .map((element: HTMLElement) => element.getBoundingClientRect())
    .filter((rect: DOMRect) => rect.width > 0 && rect.height > 0);
}

export function TooltipLayer(): ReactElement | null {
  const [active, setActive] = useState<ActiveTooltip | null>(null);
  const [position, setPosition] = useState<TooltipPosition | null>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const hoveredAnchorRef = useRef<HTMLElement | null>(null);
  const focusedAnchorRef = useRef<HTMLElement | null>(null);

  const show = useCallback((anchor: HTMLElement): void => {
    const nextActive: ActiveTooltip | null = activeTooltipFor(anchor);
    if (nextActive !== null) {
      setActive(nextActive);
    }
  }, []);

  const reconcileActive = useCallback((): void => {
    const anchor: HTMLElement | null = focusedAnchorRef.current ?? hoveredAnchorRef.current;

    if (anchor === null || !anchor.isConnected) {
      setActive(null);
      return;
    }

    show(anchor);
  }, [show]);

  useEffect(() => {
    const handlePointerOver = (event: PointerEvent): void => {
      const anchor: HTMLElement | null = tooltipTrigger(event.target);
      if (anchor === null || anchor === hoveredAnchorRef.current) {
        return;
      }

      hoveredAnchorRef.current = anchor;
      show(anchor);
    };
    const handlePointerOut = (event: PointerEvent): void => {
      const anchor: HTMLElement | null = tooltipTrigger(event.target);
      if (anchor === null || anchor !== hoveredAnchorRef.current) {
        return;
      }

      const relatedAnchor: HTMLElement | null = tooltipTrigger(event.relatedTarget);
      if (relatedAnchor === anchor) {
        return;
      }

      hoveredAnchorRef.current = relatedAnchor;
      reconcileActive();
    };
    const handleFocusIn = (event: FocusEvent): void => {
      const anchor: HTMLElement | null = tooltipTrigger(event.target);
      if (anchor !== null) {
        focusedAnchorRef.current = anchor;
        show(anchor);
      }
    };
    const handleFocusOut = (event: FocusEvent): void => {
      const anchor: HTMLElement | null = tooltipTrigger(event.target);
      if (anchor === focusedAnchorRef.current) {
        focusedAnchorRef.current = tooltipTrigger(event.relatedTarget);
        reconcileActive();
      }
    };

    document.addEventListener("pointerover", handlePointerOver, true);
    document.addEventListener("pointerout", handlePointerOut, true);
    document.addEventListener("focusin", handleFocusIn, true);
    document.addEventListener("focusout", handleFocusOut, true);

    return () => {
      document.removeEventListener("pointerover", handlePointerOver, true);
      document.removeEventListener("pointerout", handlePointerOut, true);
      document.removeEventListener("focusin", handleFocusIn, true);
      document.removeEventListener("focusout", handleFocusOut, true);
    };
  }, [reconcileActive, show]);

  const updatePosition = useCallback((): void => {
    const popup: HTMLDivElement | null = popupRef.current;
    if (active === null || popup === null || !active.anchor.isConnected) {
      setPosition(null);
      return;
    }

    const rootStyles: CSSStyleDeclaration = window.getComputedStyle(document.documentElement);
    const arrowSize: number = cssPixels(rootStyles, "--tooltip-arrow-size", 8);
    const arrowOverlap: number = cssPixels(rootStyles, "--tooltip-arrow-overlap", 1);
    const triggerGap: number = cssPixels(rootStyles, "--tooltip-trigger-gap", 4);
    const viewportPadding: number = cssPixels(rootStyles, "--tooltip-viewport-padding", 8);
    const radius: number = cssPixels(rootStyles, "--tooltip-border-radius", 8);
    const popupRect: DOMRect = popup.getBoundingClientRect();

    setPosition(
      positionTooltip({
        anchor: active.anchor.getBoundingClientRect(),
        tooltip: { width: popupRect.width, height: popupRect.height },
        viewport: { width: window.innerWidth, height: window.innerHeight },
        preferredPlacement: active.preferredPlacement,
        align: active.align,
        obstacles: visibleObstacles(active.anchor),
        distance: arrowSize + triggerGap - arrowOverlap,
        viewportPadding,
        arrowInset: radius + arrowSize,
      }),
    );
  }, [active]);

  useLayoutEffect(() => {
    setPosition(null);
    updatePosition();
  }, [active, updatePosition]);

  useEffect(() => {
    if (active === null) {
      return;
    }

    const observer: MutationObserver = new MutationObserver(reconcileActive);
    observer.observe(active.anchor, {
      attributes: true,
      attributeFilter: ["data-tooltip", "data-tooltip-placement", "data-tooltip-align"],
    });
    const resizeObserver: ResizeObserver = new ResizeObserver(updatePosition);
    resizeObserver.observe(active.anchor);
    if (popupRef.current !== null) {
      resizeObserver.observe(popupRef.current);
    }

    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      observer.disconnect();
      resizeObserver.disconnect();
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [active, reconcileActive, updatePosition]);

  if (active === null) {
    return null;
  }

  const style: TooltipCustomProperties = {
    top: position?.y ?? 0,
    left: position?.x ?? 0,
    "--tooltip-arrow-x": `${position?.arrow.x ?? 0}px`,
    "--tooltip-arrow-y": `${position?.arrow.y ?? 0}px`,
  };

  return createPortal(
    <div
      ref={popupRef}
      className="tooltip-popup"
      role="tooltip"
      data-tooltip-content={active.text}
      data-tooltip-placement={position?.placement ?? active.preferredPlacement}
      data-tooltip-visible={position === null ? undefined : "true"}
      style={style}
    >
      {active.text}
    </div>,
    document.body,
  );
}
