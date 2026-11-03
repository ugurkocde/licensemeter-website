import { describe, expect, it } from "vitest";

import { finishedReadOutcome, isFollowedRun } from "./syncStatusRun";

const CLICK = Date.parse("2026-11-03T18:00:00Z");
const baseline = { id: "before-click", after: CLICK - 5000 };

describe("isFollowedRun", () => {
  it("counts the run Sync now attached to even when it started before the click", () => {
    // The nightly run started a minute earlier; the concurrency lock handed
    // it back, so its success or failure is the result to show.
    const cronRun = { id: "cron", startedAt: "2026-11-03T17:59:00Z" };
    expect(
      isFollowedRun(cronRun, { watchedId: "cron", baseline, offsetMs: 0 }),
    ).toBe(true);
  });

  it("counts a new run started by the click", () => {
    const run = { id: "new", startedAt: "2026-11-03T18:00:01Z" };
    expect(isFollowedRun(run, { watchedId: null, baseline, offsetMs: 0 })).toBe(
      true,
    );
  });

  it("ignores the run that was latest before the click", () => {
    const run = { id: "before-click", startedAt: "2026-11-03T18:00:01Z" };
    expect(isFollowedRun(run, { watchedId: null, baseline, offsetMs: 0 })).toBe(
      false,
    );
  });

  it("ignores an older run it never watched", () => {
    const run = { id: "older", startedAt: "2026-11-03T17:59:00Z" };
    expect(
      isFollowedRun(run, { watchedId: "other", baseline, offsetMs: 0 }),
    ).toBe(false);
  });

  it("corrects the start time for server clock skew", () => {
    // Server clock 10 s ahead: a run the server stamps 18:00:08 started at
    // 17:59:58 on the client clock, inside the 5 s slack before the click.
    const run = { id: "new", startedAt: "2026-11-03T18:00:08Z" };
    expect(
      isFollowedRun(run, { watchedId: null, baseline, offsetMs: 10_000 }),
    ).toBe(true);
    const tooEarly = { id: "new", startedAt: "2026-11-03T18:00:04Z" };
    expect(
      isFollowedRun(tooEarly, { watchedId: null, baseline, offsetMs: 10_000 }),
    ).toBe(false);
  });

  it("counts any finished run when following without a click", () => {
    const run = { id: "any", startedAt: "2026-11-03T12:00:00Z" };
    expect(
      isFollowedRun(run, { watchedId: null, baseline: null, offsetMs: 0 }),
    ).toBe(true);
  });
});

describe("finishedReadOutcome", () => {
  const read = {
    followed: false,
    actionPending: false,
    clickWatch: true,
    watching: false,
  };

  it("waits while the Sync now action is still in flight", () => {
    expect(
      finishedReadOutcome({ ...read, followed: true, actionPending: true }),
    ).toBe("wait");
  });

  it("shows the followed run's result", () => {
    expect(finishedReadOutcome({ ...read, followed: true })).toBe("run");
  });

  it("falls back once the action returned without a run, on any read", () => {
    // The action threw and its own final read failed too: the next periodic
    // read, which only sees the previous finished run, must still end the
    // watch with the stored message instead of polling until the cap.
    expect(finishedReadOutcome(read)).toBe("fallback");
  });

  it("keeps following a known run instead of falling back", () => {
    expect(finishedReadOutcome({ ...read, watching: true })).toBe("wait");
  });

  it("never falls back for a run followed on load", () => {
    expect(finishedReadOutcome({ ...read, clickWatch: false })).toBe("wait");
  });
});
