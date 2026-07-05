"use client";

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
import { markTourDone } from "~/server/actions";
import type { TourStep } from "./tourSteps";

type TourPhase = "welcome" | "data";
type AvailableStep = TourStep & { element: HTMLElement };
type Position = { top: number; left: number };
type Rect = { top: number; left: number; width: number; height: number };

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const GAP = 14;
const MARGIN = 12;
const DEFAULT_POPUP = { width: 352, height: 220 };
// Wait for the dashboard's "rise" entrance animations (0.55s + stagger) to
// finish before measuring anchors, so rects aren't captured mid-transform.
const SETTLE_MS = 700;

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), Math.max(min, max));

const isVisible = (element: HTMLElement) => {
  const rect = element.getBoundingClientRect();
  return element.getClientRects().length > 0 && rect.width > 0 && rect.height > 0;
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
  finalButtonLabel,
}: {
  steps: TourStep[];
  phase: TourPhase;
  finalButtonLabel?: string;
}) => {
  const [availableSteps, setAvailableSteps] = useState<AvailableStep[] | null>(
    null,
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const [position, setPosition] = useState<Position | null>(null);
  const [anchorRect, setAnchorRect] = useState<Rect | null>(null);
  const [hidden, setHidden] = useState(false);
  const [pending, startTransition] = useTransition();
  const cardRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const dismissedRef = useRef(false);
  const titleId = useId();
  const router = useRouter();

  const activeStep = hidden
    ? null
    : (availableSteps?.[activeIndex] ?? null);
  const open = activeStep !== null;

  useEffect(() => {
    if (hidden) return;
    const timer = setTimeout(() => {
      setAvailableSteps(findAvailableSteps(steps));
      setActiveIndex(0);
      setPosition(null);
      setAnchorRect(null);
    }, SETTLE_MS);
    return () => clearTimeout(timer);
  }, [hidden, steps]);

  const finish = useCallback(() => {
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    setHidden(true);
    startTransition(async () => {
      try {
        const res = await markTourDone(phase);
        if (res.ok) router.refresh();
      } catch {
        // The tour is already dismissed locally; a failed write can retry next visit.
      }
    });
  }, [phase, router]);

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
    const placement = activeStep.placement ?? "bottom";

    let top = anchor.bottom + GAP;
    let left = anchor.left + (anchor.width - width) / 2;

    if (placement === "top") {
      top = anchor.top - height - GAP;
    } else if (placement === "left") {
      top = anchor.top + (anchor.height - height) / 2;
      left = anchor.left - width - GAP;
    } else if (placement === "right") {
      top = anchor.top + (anchor.height - height) / 2;
      left = anchor.right + GAP;
    }

    setPosition({
      top: clamp(top, MARGIN, window.innerHeight - height - MARGIN),
      left: clamp(left, MARGIN, window.innerWidth - width - MARGIN),
    });
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
    window.addEventListener("scroll", handler, { passive: true, capture: true });
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
      if (e.shiftKey ? active === first || !inside : active === last || !inside) {
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
    isLast && finalButtonLabel
      ? finalButtonLabel
      : isLast
        ? "Done"
        : "Next";

  return (
    <>
      <div className="fixed inset-0 z-40 bg-ink/30" onClick={finish} />
      {/* The ring is drawn as an overlay (not a class on the anchor) because
        * the sidebar (sticky) and the rise-animated cards create stacking
        * contexts that would trap the anchor below the backdrop. */}
      {anchorRect !== null && (
        <div
          aria-hidden="true"
          className="tour-highlight pointer-events-none fixed z-50"
          style={anchorRect}
        />
      )}
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-busy={pending || undefined}
        className="fixed z-[70] max-h-[calc(100dvh-1.5rem)] w-[min(calc(100vw-1.5rem),22rem)] overflow-y-auto rounded-2xl border border-line bg-card p-4 shadow-float"
        style={{
          top: position?.top ?? MARGIN,
          left: position?.left ?? MARGIN,
          visibility: position ? "visible" : "hidden",
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-1.5" aria-hidden="true">
              {availableSteps.map((_, i) => (
                <span
                  key={i}
                  className={`inline-block size-1.5 rounded-full ${
                    i === activeIndex ? "bg-brand" : "bg-line-strong"
                  }`}
                />
              ))}
            </div>
            <span className="sr-only">
              Step {activeIndex + 1} of {availableSteps.length}
            </span>
          </div>
          <button
            type="button"
            onClick={finish}
            className="text-xs font-medium text-ink-soft underline-offset-4 transition hover:text-ink hover:underline"
          >
            Skip tour
          </button>
        </div>
        <h2 id={titleId} className="mt-4 font-display text-xl tracking-tight">
          {activeStep.title}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          {activeStep.body}
        </p>
        <div className="mt-5 flex justify-end">
          <button
            ref={nextRef}
            type="button"
            className={buttonClass("primary")}
            onClick={() => {
              if (isLast) {
                finish();
                return;
              }
              setPosition(null);
              setAnchorRect(null);
              setActiveIndex((i) => i + 1);
            }}
          >
            {buttonLabel}
          </button>
        </div>
      </div>
    </>
  );
};
