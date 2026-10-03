import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { METERING_SCOPES } from "~/lib/metering";

const { acquire, settings } = vi.hoisted(() => ({
  acquire: vi.fn(),
  settings: {
    METERING_CLIENT_ID: "11111111-1111-1111-1111-111111111111",
    METERING_CLIENT_SECRET: "test",
    CONNECTOR_CLIENT_ID: "base",
    AUTH_MICROSOFT_ENTRA_ID_ID: "signin",
  },
}));
vi.mock("~/env", () => ({ env: settings }));
vi.mock("@azure/msal-node", () => ({
  ConfidentialClientApplication: class {
    acquireTokenByClientCredential = acquire;
  },
}));
import {
  checkedMeteringUrl,
  MeteringGraphClient,
  meteringClient,
  meteringConfigured,
} from "./graph";

const id = "22222222-2222-2222-2222-222222222222";
const path = "/deviceManagement/deviceHealthScripts";
const graph = "https://graph.microsoft.com/beta";
const fetchMock = vi.fn<typeof fetch>();
const response = (
  body: unknown,
  status = 200,
  headers?: Record<string, string>,
) => new Response(JSON.stringify(body), { status, headers });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("isolated metering Graph reads", () => {
  it("follows beta paging and selects only the package fields", async () => {
    fetchMock
      .mockResolvedValueOnce(
        response({
          value: [{ id, displayName: "Collector" }],
          "@odata.nextLink": `${graph}${path}?$skiptoken=next`,
        }),
      )
      .mockResolvedValueOnce(response({ value: [] }));
    expect(await new MeteringGraphClient("test").packages()).toEqual([
      { id, displayName: "Collector" },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const first = new URL(fetchMock.mock.calls[0]![0] as string);
    expect(first.pathname).toBe(`/beta${path}`);
    expect(first.searchParams.get("$select")).toBe("id,displayName");
    expect(
      fetchMock.mock.calls.every(
        ([, init]) => !init?.method || init.method === "GET",
      ),
    ).toBe(true);
  });
  it.each([
    "https://evil.test/beta/deviceManagement/deviceHealthScripts",
    "http://graph.microsoft.com/beta/deviceManagement/deviceHealthScripts",
    "https://graph.microsoft.com/v1.0/deviceManagement/deviceHealthScripts",
    "https://graph.microsoft.com/beta/users",
    "https://user:secret@graph.microsoft.com/beta/deviceManagement/deviceHealthScripts",
  ])("rejects unsafe next links", (url) => {
    expect(() => checkedMeteringUrl(url, path)).toThrow();
  });
  it("rejects a paging loop and malformed responses", async () => {
    fetchMock.mockResolvedValue(
      response({
        value: [],
        "@odata.nextLink": `${graph}${path}?$skiptoken=loop`,
      }),
    );
    await expect(new MeteringGraphClient("test").packages()).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    fetchMock.mockResolvedValue(response({ value: [{ id: "invalid" }] }));
    await expect(new MeteringGraphClient("test").packages()).rejects.toThrow();
  });
  it.each([
    [401, "consent"],
    [403, "forbidden"],
    [404, "missing"],
  ])("sanitizes HTTP %s", async (status, code) => {
    fetchMock.mockResolvedValue(
      response({ error: { message: "private upstream data" } }, Number(status)),
    );
    await expect(
      new MeteringGraphClient("test").packages(),
    ).rejects.toMatchObject({ code });
  });
  it("honors throttling and fails when retry would exceed the deadline", async () => {
    fetchMock
      .mockResolvedValueOnce(response({}, 429, { "retry-after": "0" }))
      .mockResolvedValueOnce(response({ value: [] }));
    expect(await new MeteringGraphClient("test").packages()).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    fetchMock.mockResolvedValue(response({}, 429, { "retry-after": "120" }));
    await expect(
      new MeteringGraphClient("test", Date.now() + 1000).packages(),
    ).rejects.toMatchObject({ code: "throttled" });
  });
  it("joins run states by the selected managedDevice id and accepts empty state lists", async () => {
    fetchMock.mockResolvedValue(response({ value: [] }));
    expect(await new MeteringGraphClient("test").states(id)).toEqual([]);
    const url = new URL(fetchMock.mock.calls[0]![0] as string);
    expect(url.searchParams.get("$expand")).toBe("managedDevice($select=id)");
    expect(url.searchParams.get("$select")).toContain(
      "preRemediationDetectionScriptOutput",
    );
  });
  it("never uses the base or sign-in application for metering", () => {
    const previous = settings.METERING_CLIENT_ID;
    try {
      settings.METERING_CLIENT_ID = settings.CONNECTOR_CLIENT_ID;
      expect(meteringConfigured()).toBe(false);
      settings.METERING_CLIENT_ID = settings.AUTH_MICROSOFT_ENTRA_ID_ID;
      expect(meteringConfigured()).toBe(false);
    } finally {
      settings.METERING_CLIENT_ID = previous;
    }
  });
  it("accepts only both metering roles in the bound tenant", async () => {
    const token = (roles: string[], tid = id) => ({
      accessToken: `header.${Buffer.from(JSON.stringify({ tid, oid: id, roles })).toString("base64url")}.signature`,
    });
    acquire.mockResolvedValue(token([...METERING_SCOPES]));
    await expect(meteringClient(id)).resolves.toBeInstanceOf(
      MeteringGraphClient,
    );
    for (const value of [
      token([METERING_SCOPES[0]]),
      token([...METERING_SCOPES, "User.Read.All"]),
      token([...METERING_SCOPES], settings.METERING_CLIENT_ID),
    ]) {
      acquire.mockResolvedValue(value);
      await expect(meteringClient(id)).rejects.toMatchObject({
        code: "consent",
      });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
