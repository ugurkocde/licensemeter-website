import { describe, expect, it, vi } from "vitest";

import type { SyncStep } from "~/server/types";

vi.mock("~/server/db", () => ({ db: {} }));

const { createStepLog } = await import("~/server/sync/stepProgress");

const step = (name: SyncStep["step"]): SyncStep => ({
  step: name,
  status: "ok",
});

/** A persist stub whose writes resolve only when the test says so. */
const controlledPersist = () => {
  const writes: { steps: string[]; resolve: () => void }[] = [];
  const persist = vi.fn(
    (steps: SyncStep[]) =>
      new Promise<void>((resolve) => {
        writes.push({ steps: steps.map((s) => s.step), resolve });
      }),
  );
  return { persist, writes };
};

describe("createStepLog", () => {
  it("records synchronously and starts a write per step when idle", async () => {
    const persist = vi.fn((_steps: SyncStep[]) => Promise.resolve());
    const log = createStepLog(persist);

    log.record(step("subscribedSkus"));
    expect(log.steps.map((s) => s.step)).toEqual(["subscribedSkus"]);
    await log.settled();
    log.record(step("users"));
    await log.settled();

    expect(persist).toHaveBeenCalledTimes(2);
    expect(persist.mock.calls[1]![0].map((s) => s.step)).toEqual([
      "subscribedSkus",
      "users",
    ]);
  });

  it("keeps one write in flight and coalesces later steps into one write of the latest log", async () => {
    const { persist, writes } = controlledPersist();
    const log = createStepLog(persist);

    log.record(step("subscribedSkus"));
    await vi.waitFor(() => expect(writes).toHaveLength(1));
    log.record(step("reportSettings"));
    log.record(step("users"));
    await Promise.resolve();
    expect(writes).toHaveLength(1);
    expect(writes[0]!.steps).toEqual(["subscribedSkus"]);

    writes[0]!.resolve();
    await vi.waitFor(() => expect(writes).toHaveLength(2));
    expect(writes[1]!.steps).toEqual([
      "subscribedSkus",
      "reportSettings",
      "users",
    ]);

    let settled = false;
    void log.settled().then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    writes[1]!.resolve();
    await log.settled();
    expect(persist).toHaveBeenCalledTimes(2);
  });

  it("swallows a failed write, logs it once and keeps writing later steps", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const persist = vi
      .fn<(steps: SyncStep[]) => Promise<unknown>>()
      .mockRejectedValueOnce(new Error("connection reset"))
      .mockImplementationOnce(() => {
        throw new Error("sync throw");
      })
      .mockResolvedValue(undefined);
    const log = createStepLog(persist);

    log.record(step("subscribedSkus"));
    await expect(log.settled()).resolves.toBeUndefined();
    log.record(step("users"));
    await expect(log.settled()).resolves.toBeUndefined();
    log.record(step("wasteAnalysis"));
    await log.settled();

    expect(persist).toHaveBeenCalledTimes(3);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("steps recorded in the same tick share one write", async () => {
    const persist = vi.fn((_steps: SyncStep[]) => Promise.resolve());
    const log = createStepLog(persist);

    log.record(step("subscribedSkus"));
    log.record(step("subscriptions"));
    await log.settled();

    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist.mock.calls[0]![0]).toHaveLength(2);
  });

  it("stops waiting for a stalled write after the settle limit", async () => {
    vi.useFakeTimers();
    try {
      const { persist } = controlledPersist();
      const log = createStepLog(persist);
      log.record(step("users"));
      let settled = false;
      void log.settled().then(() => {
        settled = true;
      });
      await vi.advanceTimersByTimeAsync(1999);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(settled).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("settles immediately when nothing was recorded", async () => {
    const persist = vi.fn(() => Promise.resolve());
    await createStepLog(persist).settled();
    expect(persist).not.toHaveBeenCalled();
  });
});
