import { beforeEach, describe, expect, it, vi } from "vitest";

const { runSync, revalidatePath } = vi.hoisted(() => ({
  runSync: vi.fn(),
  revalidatePath: vi.fn(),
}));
vi.mock("~/server/sync/runSync", () => ({ runSync }));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("~/server/access", () => ({
  apiAccess: async () => ({ tenant: { id: "tenant", isDemo: false } }),
}));
vi.mock("~/server/audit", () => ({ audit: async () => undefined }));
vi.mock("~/server/auth/origin", () => ({ isSameOrigin: () => true }));
vi.mock("~/server/db", () => ({ db: {} }));
vi.mock("~/server/rateLimit", () => ({ rateLimitDurable: async () => true }));

const { POST } = await import("./route");
const request = () =>
  new Request("https://example.test/api/sync", { method: "POST" });

describe("POST /api/sync tenant lock", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns a conflict when no sync was registered", async () => {
    runSync.mockResolvedValue({ runId: null, status: "running", steps: [] });
    const response = await POST(request());
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "sync_in_progress" });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("returns the existing run id when a sync is already running", async () => {
    const result = { runId: "in-flight", status: "running", steps: [] };
    runSync.mockResolvedValue(result);
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(result);
    expect(revalidatePath).toHaveBeenCalledWith("/app", "layout");
  });
});
