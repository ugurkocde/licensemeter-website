"use client";

import { ArrowLeft, ArrowRight, Compass, X } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useTransition,
} from "react";

import { buttonClass } from "~/components/ui";
import { tourStorageKey } from "~/lib/tourStorage";
import type { TourPhase } from "~/lib/tourStorage";
import { markTourDone } from "~/server/actions";
import type { TourStep } from "./tourSteps";

type AvailableStep = TourStep & { element: HTMLElement };
type Placement = "top" | "bottom" | "left" | "right";
type Position = { top: number; left: number };
type Rect = { top: number; left: number; width: number; height: number };
type Layout = { position: Position; placement: Placement; beak: number };

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
// Gap between the anchor and the card, and the space the card keeps from the
// viewport edge.
const GAP = 16;
const MARGIN = 12;
// Half the rendered size of the arrow beak, used to centre it on a card edge.
const BEAK = 7;
const DEFAULT_POPUP = { width: 384, height: 232 };
// Wait for the dashboard's "rise" entrance animations (0.55s + stagger) to
// finish before measuring anchors, so rects aren't captured mid-transform.
const SETTLE_MS = 700;

const OPPOSITE: Record<Placement, Placement> = {
  top: "bottom",
  bottom: "top",
  left: "right",
  right: "left",
};

// Only the two outer sides of the beak are bordered, so it reads as a notch cut
// from the card pointing back at the anchor.
const BEAK_SIDES: Record<Placement, string> = {
  bottom: "border-t border-l",
  top: "border-r border-b",
  left: "border-t border-r",
  right: "border-l border-b",
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), Math.max(min, max));

const beakStyle = (layout: Layout): React.CSSProperties => {
  if (layout.placement === "bottom" || layout.placement === "top") {
    return {
      left: layout.beak - BEAK,
      top: layout.placement === "bottom" ? -BEAK : undefined,
      bottom: layout.placement === "top" ? -BEAK : undefined,
    };
  }
  return {
    top: layout.beak - BEAK,
    right: layout.placement === "left" ? -BEAK : undefined,
    left: layout.placement === "right" ? -BEAK : undefined,
  };
};

const isVisible = (element: HTMLElement) => {
  const rect = element.getBoundingClientRect();
  return (
    element.getClientRects().length > 0 && rect.width > 0 && rect.height > 0
  );
};

const findAvailableSteps = (steps: TourStep[]): AvailableStep[] =>
  steps.flatMap((step) => {
    const element = document.querySelector<HTMLElement>(
      `[data-tour="${step.anchor}"]`,
    );
    return element && isVisible(element) ? [{ ...step, element }] : [];
  });

export const Tour = ({
  steps,
  phase,
  storageId,
  finalButtonLabel,
}: {
  steps: TourStep[];
  phase: TourPhase;
  storageId: string;
  finalButtonLabel?: string;
}) => {
  const [availableSteps, setAvailableSteps] = useState<AvailableStep[] | null>(
    null,
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const [layout, setLayout] = useState<Layout | null>(null);
  const [anchorRect, setAnchorRect] = useState<Rect | null>(null);
  const [hidden, setHidden] = useState(false);
  const [pending, startTransition] = useTransition();
  const cardRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const dismissedRef = useRef(false);
  const titleId = useId();
  const router = useRouter();
  const localKey = tourStorageKey(storageId, phase);

  const activeStep = hidden ? null : (availableSteps?.[activeIndex] ?? null);
  const open = activeStep !== null;

  useEffect(() => {
    try {
      if (window.localStorage.getItem(localKey) === "done") setHidden(true);
    } catch {
      // Storage can be unavailable in hardened/private browsing contexts.
    }
  }, [localKey]);

  useEffect(() => {
    if (hidden) return;
    const timer = setTimeout(() => {
      setAvailableSteps(findAvailableSteps(steps));
      setActiveIndex(0);
      setLayout(null);
      setAnchorRect(null);
    }, SETTLE_MS);
    return () => clearTimeout(timer);
  }, [hidden, steps]);

  const finish = useCallback(() => {
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    try {
      window.localStorage.setItem(localKey, "done");
    } catch {
      // The server-side timestamp remains the source of truth.
    }
    setHidden(true);
    startTransition(async () => {
      try {
        const res = await markTourDone(phase);
        if (res.ok) router.refresh();
      } catch {
        // The tour is already dismissed locally; a failed write can retry next visit.
      }
    });
  }, [localKey, phase, router]);

  const goToStep = useCallback((index: number) => {
    setLayout(null);
    setAnchorRect(null);
    setActiveIndex(index);
  }, []);

  const updatePosition = useCallback(() => {
    if (!activeStep || !cardRef.current) return;

    const anchor = activeStep.element.getBoundingClientRect();
    setAnchorRect({
      top: anchor.top,
      left: anchor.left,
      width: anchor.width,
      height: anchor.height,
    });

    const popup = cardRef.current.getBoundingClientRect();
    const width = popup.width || DEFAULT_POPUP.width;
    const height = popup.height || DEFAULT_POPUP.height;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Prefer the step's placement, but flip to another side when the card
    // would spill past the viewport, so it never covers the thing it explains
    // by accident.
    const fits = (p: Placement) => {
      if (p === "bottom") return anchor.bottom + GAP + height <= vh - MARGIN;
      if (p === "top") return anchor.top - GAP - height >= MARGIN;
      if (p === "left") return anchor.left - GAP - width >= MARGIN;
      return anchor.right + GAP + width <= vw - MARGIN;
    };
    const preferred = activeStep.placement ?? "bottom";
    const order: Placement[] = [
      preferred,
      OPPOSITE[preferred],
      "bottom",
      "top",
      "left",
      "right",
    ];
    const placement = order.find(fits) ?? preferred;

    let top: number;
    let left: number;
    if (placement === "bottom") {
      top = anchor.bottom + GAP;
      left = anchor.left + (anchor.width - width) / 2;
    } else if (placement === "top") {
      top = anchor.top - height - GAP;
      left = anchor.left + (anchor.width - width) / 2;
    } else if (placement === "left") {
      top = anchor.top + (anchor.height - height) / 2;
      left = anchor.left - width - GAP;
    } else {
      top = anchor.top + (anchor.height - height) / 2;
      left = anchor.right + GAP;
    }

    top = clamp(top, MARGIN, vh - height - MARGIN);
    left = clamp(left, MARGIN, vw - width - MARGIN);

    // Centre the beak on the anchor along the card edge, kept clear of corners.
    const beak =
      placement === "bottom" || placement === "top"
        ? clamp(
            anchor.left + anchor.width / 2 - left,
            BEAK + 8,
            width - BEAK - 8,
          )
        : clamp(
            anchor.top + anchor.height / 2 - top,
            BEAK + 8,
            height - BEAK - 8,
          );

    setLayout({ position: { top, left }, placement, beak });
  }, [activeStep]);

  useLayoutEffect(() => {
    if (!activeStep) return;
    activeStep.element.scrollIntoView({ block: "nearest", inline: "nearest" });
    const frame = requestAnimationFrame(updatePosition);
    return () => cancelAnimationFrame(frame);
  }, [activeStep, updatePosition]);

  useEffect(() => {
    if (!activeStep) return;
    const handler = () => updatePosition();
    window.addEventListener("resize", handler);
    // Capture phase so scrolls inside nested containers (e.g. the sidebar's
    // own overflow scroller) also reposition the popup and highlight ring.
    window.addEventListener("scroll", handler, {
      passive: true,
      capture: true,
    });
    return () => {
      window.removeEventListener("resize", handler);
      window.removeEventListener("scroll", handler, { capture: true });
    };
  }, [activeStep, updatePosition]);

  useEffect(() => {
    if (!open) return;
    restoreRef.current ??=
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    nextRef.current?.focus();

    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        finish();
        return;
      }
      if (e.key !== "Tab" || !cardRef.current) return;
      const focusables = Array.from(
        cardRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
      );
      if (focusables.length === 0) return;
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      const active = document.activeElement;
      const inside =
        active instanceof HTMLElement && cardRef.current.contains(active);
      if (
        e.shiftKey ? active === first || !inside : active === last || !inside
      ) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      }
    };

    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
      restoreRef.current?.focus();
    };
  }, [finish, open]);

  if (!open || !availableSteps || availableSteps.length === 0) return null;

  const isLast = activeIndex === availableSteps.length - 1;
  const buttonLabel =
    isLast && finalButtonLabel ? finalButtonLabel : isLast ? "Done" : "Next";

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={finish} />
      {/* The spotlight is drawn as an overlay (not a class on the anchor)
       * because the sidebar (sticky) and the rise-animated cards create
       * stacking contexts that would trap the anchor below the backdrop. Its
       * transparent interior punches a hole in the dim so the anchor stays
       * legible. */}
      {anchorRect !== null && (
        <div
          aria-hidden="true"
          className="tour-highlight pointer-events-none fixed z-50"
          style={anchorRect}
        />
      )}
      <div
        className="tour-card fixed z-[70] w-[min(calc(100vw-1.5rem),24rem)]"
        style={{
          top: layout?.position.top ?? MARGIN,
          left: layout?.position.left ?? MARGIN,
          visibility: layout ? "visible" : "hidden",
        }}
      >
        {layout && (
          <span
            aria-hidden="true"
            className={`bg-card border-line absolute size-3.5 rotate-45 rounded-[3px] border ${BEAK_SIDES[layout.placement]}`}
            style={beakStyle(layout)}
          />
        )}
        <div
          ref={cardRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-busy={pending || undefined}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight" && !isLast) {
              e.preventDefault();
              goToStep(activeIndex + 1);
            } else if (e.key === "ArrowLeft" && activeIndex > 0) {
              e.preventDefault();
              goToStep(activeIndex - 1);
            }
          }}
          className="border-line bg-card shadow-hero max-h-[calc(100dvh-1.5rem)] overflow-y-auto rounded-2xl border"
        >
          <div className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="bg-brand-soft text-brand-text flex size-7 items-center justify-center rounded-lg"
                >
                  <Compass className="size-4" strokeWidth={1.75} />
                </span>
                <span className="text-ink-faint text-[11px] font-medium tracking-[0.14em] uppercase">
                  Product tour
                </span>
              </div>
              <button
                type="button"
                onClick={finish}
                aria-label="Skip tour"
                className="text-ink-soft hover:text-ink hover:bg-subtle -mt-1 -mr-1 inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium transition"
              >
                Skip tour
                <X className="size-3.5" strokeWidth={2} />
              </button>
            </div>

            <div key={activeIndex} className="tour-step" aria-live="polite">
              <h2
                id={titleId}
                className="font-display mt-4 text-lg leading-snug tracking-tight"
              >
                {activeStep.title}
              </h2>
              <p className="text-ink-soft mt-2 text-sm leading-relaxed">
                {activeStep.body}
              </p>
            </div>

            <div className="mt-5 flex items-center gap-3">
              <div className="bg-line h-1 flex-1 overflow-hidden rounded-full">
                <div
                  className="bg-brand h-full rounded-full transition-[width] duration-300 ease-out motion-reduce:transition-none"
                  style={{
                    width: `${((activeIndex + 1) / availableSteps.length) * 100}%`,
                  }}
                />
              </div>
              <span className="text-ink-faint tnum shrink-0 text-[11px] font-medium">
                {activeIndex + 1} / {availableSteps.length}
              </span>
            </div>

            <div className="mt-4 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => goToStep(activeIndex - 1)}
                disabled={activeIndex === 0}
                className={buttonClass("secondary")}
              >
                <ArrowLeft className="size-4" strokeWidth={1.75} />
                Back
              </button>
              <button
                ref={nextRef}
                type="button"
                className={buttonClass("primary")}
                onClick={() => {
                  if (isLast) {
                    finish();
                    return;
                  }
                  goToStep(activeIndex + 1);
                }}
              >
                {buttonLabel}
                {!isLast && (
                  <ArrowRight className="size-4" strokeWidth={1.75} />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
