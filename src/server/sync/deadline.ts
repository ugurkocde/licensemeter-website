/**
 * One absolute deadline per request. The long routes export maxDuration 300s;
 * every retry, throttle sleep and Graph request checks this so the platform
 * never kills a run mid-write. Callers that run work inside `after()` compute
 * the deadline when the handler starts, so the deferred work shares the budget.
 *
 * The deadline is a wall-clock instant (ms since epoch), not a per-step timeout:
 * passing it down means each layer can ask "does this wait still fit?", and the
 * whole request stays inside the platform limit instead of each retry counting
 * its own budget.
 */
export const REQUEST_MAX_DURATION_MS = 300_000;

/**
 * Headroom kept for the response, logging and the work after the last network
 * call (analysis, the snapshot write, findings diff). Network calls also clamp
 * their own timeouts to the remaining time, so this only has to cover local
 * work.
 */
export const REQUEST_DEADLINE_MARGIN_MS = 25_000;

/** Absolute deadline for work that starts now, given the route's maxDuration. */
export const requestDeadline = (
  maxDurationMs: number = REQUEST_MAX_DURATION_MS,
): number => Date.now() + maxDurationMs - REQUEST_DEADLINE_MARGIN_MS;

/** True when a wait of waitMs still fits before an absolute deadline. */
export const withinDeadline = (
  deadline: number | undefined,
  waitMs: number,
): boolean => deadline === undefined || Date.now() + waitMs <= deadline;

/** Longest an optional sync step (such as the subscriptions read) may take. */
export const OPTIONAL_STEP_BUDGET_MS = 20_000;

/**
 * Time kept free after an optional step for the reads and connectors that
 * still follow it (usage and Copilot reports, Adobe, SaaS).
 */
export const OPTIONAL_STEP_RESERVE_MS = 60_000;

/** Below this much budget an optional step is skipped instead of started. */
export const OPTIONAL_STEP_MIN_MS = 3_000;

/**
 * Deadline for an optional step starting now: at most OPTIONAL_STEP_BUDGET_MS,
 * and never into the reserve before the request deadline. Null when less
 * than OPTIONAL_STEP_MIN_MS would remain, so the caller skips the step.
 */
export const optionalStepDeadline = (
  deadline: number | undefined,
  now: number = Date.now(),
): number | null => {
  const until = Math.min(
    now + OPTIONAL_STEP_BUDGET_MS,
    deadline === undefined ? Infinity : deadline - OPTIONAL_STEP_RESERVE_MS,
  );
  return until - now >= OPTIONAL_STEP_MIN_MS ? until : null;
};
