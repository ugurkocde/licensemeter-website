import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { METERING_SCOPES } from "~/lib/metering";
import { collectorScript } from "./catalog";

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
  parseCollector,
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
  it("keeps only assigned Windows apps and program files from detection rules", async () => {
    fetchMock.mockResolvedValue(
      response({
        value: [
          {
            "@odata.type": "#microsoft.graph.win32LobApp",
            id: id.toUpperCase(),
            displayName: "AutoCAD 2026",
            publisher: "Autodesk",
            rules: [
              { ruleType: "detection", fileOrFolderName: "ACAD.EXE" },
              { ruleType: "requirement", fileOrFolderName: "other.exe" },
              { ruleType: "detection", fileOrFolderName: "readme.txt" },
            ],
          },
          {
            "@odata.type": "#microsoft.graph.macOSDmgApp",
            id,
            displayName: "Mac app",
          },
          {
            "@odata.type": "#microsoft.graph.officeSuiteApp",
            id,
            displayName: "Microsoft 365 Apps",
            productIds: ["o365ProPlusRetail", "visioProRetail"],
          },
        ],
      }),
    );
    const apps = await new MeteringGraphClient("test").apps();
    expect(apps).toEqual([
      {
        id,
        type: "win32LobApp",
        name: "AutoCAD 2026",
        publisher: "Autodesk",
        detected: ["acad.exe"],
        products: [],
      },
      {
        id,
        type: "officeSuiteApp",
        name: "Microsoft 365 Apps",
        publisher: "",
        detected: [],
        products: ["o365ProPlusRetail", "visioProRetail"],
      },
    ]);
    expect(
      new URL(fetchMock.mock.calls[0]![0] as string).searchParams.get(
        "$filter",
      ),
    ).toBe("isAssigned eq true");
  });
  it("asks the install report for device and state columns only", async () => {
    const other = "33333333-3333-3333-3333-333333333333";
    fetchMock.mockResolvedValue(
      response({
        TotalRowCount: 2,
        Schema: [
          { Column: "AppInstallState" },
          { Column: "AppInstallState_loc" },
          { Column: "ApplicationId" },
          { Column: "DeviceId" },
          { Column: "InstallState" },
        ],
        Values: [
          ["S1", "Installed", id, id.toUpperCase(), 1],
          ["S2", "Failed", other, other, 2],
        ],
      }),
    );
    expect(await new MeteringGraphClient("test").installs([id, other])).toEqual(
      { [id]: [id], [other]: [] },
    );
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(new URL(url as string).pathname).toBe(
      "/beta/deviceManagement/reports/retrieveDeviceAppInstallationStatusReport",
    );
    expect(init?.method).toBe("POST");
    const body = JSON.parse(init!.body as string) as {
      select: string[];
      filter: string;
    };
    expect(body.select).toEqual([
      "ApplicationId",
      "DeviceId",
      "InstallState",
      "AppInstallState",
    ]);
    expect(body.filter).toBe(
      `(ApplicationId eq '${id}') or (ApplicationId eq '${other}')`,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("fails closed when the install report returns user columns", async () => {
    fetchMock.mockResolvedValue(
      response({
        TotalRowCount: 1,
        Schema: [{ Column: "DeviceId" }, { Column: "UserPrincipalName" }],
        Values: [[id, "person@example.test"]],
      }),
    );
    await expect(
      new MeteringGraphClient("test").installs([id]),
    ).rejects.toMatchObject({ code: "response" });
  });
  it("finds the collector package by its deployed script", async () => {
    const script = Buffer.from(
      await collectorScript(["acad.exe", "photoshop.exe"]),
    ).toString("base64");
    const other = Buffer.from("Write-Output 'unrelated'").toString("base64");
    const second = "33333333-3333-3333-3333-333333333333";
    fetchMock
      .mockResolvedValueOnce(
        response({
          value: [
            { id, displayName: "LicenseMeter pilot" },
            { id: second, displayName: "Disk cleanup" },
          ],
        }),
      )
      .mockResolvedValueOnce(
        response({
          responses: [
            {
              id: "0",
              status: 200,
              body: { id, detectionScriptContent: script },
            },
            {
              id: "1",
              status: 200,
              body: { id: second, detectionScriptContent: other },
            },
          ],
        }),
      );
    expect(await new MeteringGraphClient("test").collectors()).toEqual([
      {
        id,
        name: "LicenseMeter pilot",
        catalogId: expect.stringMatching(/^[0-9a-f]{8}$/) as string,
        programs: ["acad.exe", "photoshop.exe"],
      },
    ]);
    const [url, init] = fetchMock.mock.calls[1]!;
    expect(new URL(url as string).pathname).toBe("/beta/$batch");
    expect(init?.method).toBe("POST");
  });
  it("reads program names with brackets", async () => {
    const script = Buffer.from(
      await collectorScript(["app (x86).exe", "acad.exe"]),
    ).toString("base64");
    expect(parseCollector(script)?.programs).toEqual([
      "app (x86).exe",
      "acad.exe",
    ]);
  });
  it("skips a deleted package but fails on a throttled one", async () => {
    const listed = response({ value: [{ id, displayName: "Pilot" }] });
    fetchMock
      .mockResolvedValueOnce(listed)
      .mockResolvedValueOnce(
        response({ responses: [{ id: "0", status: 404, body: {} }] }),
      );
    expect(await new MeteringGraphClient("test").collectors()).toEqual([]);
    fetchMock
      .mockResolvedValueOnce(
        response({ value: [{ id, displayName: "Pilot" }] }),
      )
      .mockResolvedValueOnce(
        response({ responses: [{ id: "0", status: 429, body: {} }] }),
      );
    await expect(
      new MeteringGraphClient("test").collectors(),
    ).rejects.toMatchObject({ code: "throttled" });
  });
  it("ignores scripts that are not the collector or carry invalid names", () => {
    const encode = (text: string) => Buffer.from(text).toString("base64");
    expect(parseCollector(encode("$CatalogId = 'a1b2c3d4'"))).toBeNull();
    expect(
      parseCollector(
        encode(
          "LicenseMeter Windows usage collector, protocol 2\n$CatalogId = 'a1b2c3d4'\n$Programs = @('C:\\evil.exe')",
        ),
      ),
    ).toBeNull();
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
  it("accepts exactly the metering roles in the bound tenant", async () => {
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
