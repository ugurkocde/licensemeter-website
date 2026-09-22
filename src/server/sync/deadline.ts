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
