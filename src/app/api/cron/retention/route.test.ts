import * as NextServer from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const CRON_SECRET = "s3cret-s3cret-s3cret";
const { after, runRetention, migrateLegacySecrets, sendDemoOpenDigest } =
  vi.hoisted(() => ({
    after: vi.fn<(_task: () => Promise<void>) => void>(),
    runRetention: vi.fn(),
    migrateLegacySecrets: vi.fn(),
    sendDemoOpenDigest: vi.fn(),
  }));

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof NextServer>()),
  after,
}));
vi.mock("~/env", () => ({ env: { CRON_SECRET } }));
vi.mock("~/server/ops", () => ({ notifyOps: vi.fn(), sendDemoOpenDigest }));
vi.mock("~/server/retention", () => ({ runRetention }));
vi.mock("~/server/secretMigration", () => ({ migrateLegacySecrets }));

const { GET } = await import("./route");

const request = (secret: string) =>
  new NextServer.NextRequest("https://licensemeter.test/api/cron/retention", {
    headers: { authorization: `Bearer ${secret}` },
  });

describe("GET /api/cron/retention", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    runRetention.mockResolvedValue({ deletedSignIns: 2 });
    migrateLegacySecrets.mockResolvedValue({ migrated: 1 });
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => vi.restoreAllMocks());

  it("registers the digest after authorization and isolates its rejection", async () => {
    sendDemoOpenDigest.mockRejectedValueOnce(new Error("digest unavailable"));
    const response = await GET(request(CRON_SECRET));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      deletedSignIns: 2,
      secrets: { migrated: 1 },
    });
    expect(after).toHaveBeenCalledTimes(1);
    expect(sendDemoOpenDigest).not.toHaveBeenCalled();
    const [digest] = after.mock.calls[0]!;
    await expect(digest()).resolves.toBeUndefined();
    expect(sendDemoOpenDigest).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledWith(
      "[retention] demo digest failed",
      expect.any(Error),
    );
  });

  it("runs retention when after() cannot register the digest", async () => {
    after.mockImplementationOnce(() => {
      throw new Error("no request scope");
    });
    expect((await GET(request(CRON_SECRET))).status).toBe(200);
    expect(runRetention).toHaveBeenCalledTimes(1);
    expect(migrateLegacySecrets).toHaveBeenCalledTimes(1);
    expect(sendDemoOpenDigest).not.toHaveBeenCalled();
  });

  it("rejects unauthorized requests without scheduling the digest", async () => {
    expect((await GET(request("wrong"))).status).toBe(401);
    expect(after).not.toHaveBeenCalled();
    expect(runRetention).not.toHaveBeenCalled();
  });
});
