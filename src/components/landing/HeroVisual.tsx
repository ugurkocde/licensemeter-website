"use client";

import { useEffect, useState } from "react";
import { Check, Circle, LoaderCircle } from "lucide-react";

import { DEMO_FIGURES, demoEuros } from "~/lib/demoFigures";

/* Ledger lines render from the tested demo figures and sum to the headline:
 * the card is a synthetic sample tenant, not customer proof. Tones map to the
 * categorical meter ramp in globals.css. `cumStart` is the running euro total
 * before this line, so the count-up can fill lines one at a time. */
let runningCents = 0;
const LINES = (
  [
    {
      label: "Left the company, still licensed",
      cents: DEMO_FIGURES.byCategory.leavers,
      tone: "meter-danger",
    },
    {
      label: "Inactive 90+ days or never used",
      cents: DEMO_FIGURES.byCategory.idle,
      tone: "meter-waste",
    },
    {
      label: "Unassigned paid seats",
      cents: DEMO_FIGURES.byCategory.shelfware,
      tone: "meter-slate",
    },
    {
      label: "Copilot seats never opened",
      cents: DEMO_FIGURES.byCategory.copilotUnused,
      tone: "meter-plum",
    },
    {
      label: "App seats with no directory account",
      cents: DEMO_FIGURES.byCategory.orphaned,
      tone: "meter-gold",
    },
    {
      label: "Licensed guest accounts",
      cents: DEMO_FIGURES.byCategory.guests,
      tone: "meter-teal",
    },
  ] as const
).map((line) => {
  const cumStart = runningCents;
  runningCents += line.cents;
  return { ...line, cumStart };
});

const SCAN_STREAM = [
  "Directory status",
  "License assignments",
  "Sign-in activity",
  "Usage reports",
  "Connected app seats",
  "Daily AI spend",
] as const;

const FINAL_CENTS = DEMO_FIGURES.monthlyWasteCents;
const STEPS = LINES.length;

/* Per-phase "analyzing" pause (ms) before that phase reports its finding.
 * Deliberately uneven — sign-in/usage queries are the slow ones — so the scan
 * never feels metronomic. Each phase then counts its chunk up over TWEEN_MS. */
const DWELLS = [240, 380, 520, 580, 360, 260];
const TWEEN_MS = 380;

const clamp = (n: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, n));

/**
 * The hero product visual: a self-contained, themed mockup of the waste ledger
 * a real scan produces. On load it plays a one-shot, phase-by-phase scan — each
 * row analyzes (amber spinner) for an uneven beat, then "discovers" its finding:
 * the matching ledger line fills and the euro total ticks up by that chunk, top
 * to bottom, so the number arrives in realistic jumps rather than a smooth ramp.
 * Static demo figures, so SSR renders the final state (good for crawlers/no-JS);
 * the scan only runs client-side and is skipped under prefers-reduced-motion.
 */
export const HeroVisual = ({ month }: { month: string }) => {
  // Init at the finished state so SSR + reduced-motion show the real numbers.
  const [totalCents, setTotalCents] = useState<number>(FINAL_CENTS);
  const [completed, setCompleted] = useState(STEPS);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let cancelled = false;
    let rafId: number | null = null;
    let toId: ReturnType<typeof setTimeout> | null = null;
    setTotalCents(0);
    setCompleted(0);

    const runPhase = (k: number) => {
      const line = LINES[k];
      if (cancelled || !line) return;
      toId = setTimeout(() => {
        if (cancelled) return;
        const from = line.cumStart;
        const to = line.cumStart + line.cents;
        let startTs: number | null = null;
        const tick = (now: number) => {
          if (cancelled) return;
          startTs ??= now;
          const p = Math.min(1, (now - startTs) / TWEEN_MS);
          const eased = 1 - Math.pow(1 - p, 3);
          setTotalCents(Math.round(from + (to - from) * eased));
          if (p < 1) {
            rafId = requestAnimationFrame(tick);
          } else {
            setCompleted(k + 1);
            runPhase(k + 1);
          }
        };
        rafId = requestAnimationFrame(tick);
      }, DWELLS[k] ?? 400);
    };
    runPhase(0);

    return () => {
      cancelled = true;
      if (toId) clearTimeout(toId);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <div className="border-line bg-card shadow-hero relative overflow-hidden rounded-3xl border">
      <div className="grid lg:grid-cols-[1fr_0.72fr]">
        <div className="px-4 py-5 sm:px-6">
          <div>
            <p className="text-ink-faint text-[11px] font-medium tracking-[0.12em] uppercase">
              Waste ledger · {month}
            </p>
            <div className="font-display text-waste-text tnum mt-2 text-4xl tracking-tight whitespace-nowrap sm:text-5xl">
              € {demoEuros(totalCents)}
              <span className="text-ink-faint text-base font-normal">/mo</span>
            </div>
          </div>

          <ul className="mt-5 space-y-3">
            {LINES.map((line) => {
              const value = clamp(totalCents - line.cumStart, 0, line.cents);
              const found = totalCents > line.cumStart;
              return (
                <li key={line.label}>
                  <div className="flex items-baseline justify-between gap-4">
                    <span
                      className={found ? "text-ink-soft text-sm" : "text-ink-faint text-sm italic"}
                    >
                      {line.label}
                    </span>
                    <span className="tnum font-mono text-sm whitespace-nowrap min-w-[6.5rem] text-right">
                      {found ? (
                        <span className="text-ink">
                          € {demoEuros(value)}
                          <span className="text-ink-faint">/mo</span>
                        </span>
                      ) : (
                        <span className="text-ink-faint">-</span>
                      )}
                    </span>
                  </div>
                  <div className="bg-line mt-2 h-1.5 overflow-hidden rounded-full">
                    <div
                      className={`${line.tone} h-full rounded-full`}
                      style={{ width: `${(value / FINAL_CENTS) * 100}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <aside className="border-line bg-ink-panel text-canvas hidden flex-col px-5 py-6 lg:flex lg:border-l">
          <ol className="space-y-3">
            {SCAN_STREAM.map((item, index) => {
              const done = index < completed;
              const scanning = index === completed;
              return (
                <li
                  key={item}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <span
                    className={
                      done
                        ? "text-canvas/85"
                        : scanning
                          ? "text-canvas"
                          : "text-canvas/40"
                    }
                  >
                    {item}
                  </span>
                  {done ? (
                    <Check
                      className="text-good size-4 shrink-0"
                      aria-label="done"
                    />
                  ) : scanning ? (
                    <LoaderCircle
                      className="text-waste size-4 shrink-0 animate-spin"
                      aria-label="scanning"
                    />
                  ) : (
                    <Circle
                      className="text-canvas/25 size-4 shrink-0"
                      aria-hidden="true"
                    />
                  )}
                </li>
              );
            })}
          </ol>

          <div className="mt-auto pt-6">
            <div className="bg-canvas/10 h-1 overflow-hidden rounded-full">
              <div
                className="bg-brand-bright h-full rounded-full transition-[width] duration-300 ease-out"
                style={{ width: `${(totalCents / FINAL_CENTS) * 100}%` }}
              />
            </div>
            <p className="text-ink-soft-text mt-2.5 text-[11px] font-medium tracking-[0.12em] uppercase">
              {completed < STEPS ? "Scanning tenant…" : "Scan complete"}
            </p>
          </div>
        </aside>
      </div>

      <div className="border-line text-ink-faint border-t px-4 py-3 text-center text-xs sm:px-6">
        Your scan returns this ledger, with your tenant&rsquo;s real numbers.
      </div>
    </div>
  );
};
