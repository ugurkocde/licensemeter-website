import { describe, expect, it } from "vitest";
import {
  buildCatalog,
  catalogId,
  catalogPrograms,
  collectorScript,
} from "./catalog";
import type { MeteringApp } from "./graph";

const app = (patch: Partial<MeteringApp>): MeteringApp => ({
  id: "11111111-1111-1111-1111-111111111111",
  type: "win32LobApp",
  name: "App",
  publisher: "Publisher",
  detected: [],
  products: [],
  ...patch,
});
const none = { excludedApps: [], programOverrides: {} };

describe("metering app catalog", () => {
  it("prefers an admin entry, then the detection rule, then the known app list", () => {
    const photoshop = app({
      name: "Adobe Photoshop 2025",
      detected: ["Photoshop.exe"],
    });
    expect(buildCatalog([photoshop], none)[0]).toMatchObject({
      programs: ["photoshop.exe"],
      source: "detection",
    });
    expect(
      buildCatalog([app({ name: "Adobe Photoshop 2025" })], none)[0],
    ).toMatchObject({
      programs: ["photoshop.exe"],
      source: "catalog",
    });
    expect(
      buildCatalog([photoshop], {
        excludedApps: [],
        programOverrides: { [photoshop.id]: ["PS.exe"] },
      })[0],
    ).toMatchObject({ programs: ["ps.exe"], source: "admin" });
    expect(
      buildCatalog([app({ name: "Contoso Tracker" })], none)[0],
    ).toMatchObject({ programs: [], source: "none" });
  });
  it("combines the same app assigned several times into one entry", () => {
    const entries = buildCatalog(
      [
        app({
          id: "22222222-2222-2222-2222-222222222222",
          name: "PowerToys",
          publisher: "Microsoft",
        }),
        app({
          id: "11111111-1111-1111-1111-111111111111",
          name: "PowerToys",
          publisher: "Microsoft",
          detected: ["PowerToys.exe"],
        }),
        app({
          id: "33333333-3333-3333-3333-333333333333",
          name: "PowerToys",
          publisher: "Other",
        }),
      ],
      none,
    );
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      id: "11111111-1111-1111-1111-111111111111",
      appIds: [
        "11111111-1111-1111-1111-111111111111",
        "22222222-2222-2222-2222-222222222222",
      ],
      programs: ["powertoys.exe"],
      source: "detection",
    });
  });
  it("matches Acrobat Reader before Acrobat", () => {
    expect(
      buildCatalog([app({ name: "Adobe Acrobat Reader (64-bit)" })], none)[0]!
        .programs,
    ).toEqual(["acrord32.exe", "acrobat.exe"]);
    expect(
      buildCatalog([app({ name: "Adobe Acrobat Pro" })], none)[0]!.programs,
    ).toEqual(["acrobat.exe"]);
  });
  it("splits Visio and Project out of Microsoft 365 Apps", () => {
    const suite = app({
      type: "officeSuiteApp",
      name: "Microsoft 365 Apps",
      products: ["o365ProPlusRetail", "visioProRetail"],
    });
    const entries = buildCatalog([suite], none);
    expect(
      entries.map((entry) => [entry.id, entry.appIds[0] === suite.id]),
    ).toEqual([
      [suite.id, true],
      [`${suite.id}:visio`, true],
    ]);
    expect(entries[1]!.programs).toEqual(["visio.exe"]);
  });
  it("drops excluded apps and invalid names from the collector list", () => {
    const keep = app({ name: "AutoCAD 2026" });
    const drop = app({
      id: "22222222-2222-2222-2222-222222222222",
      name: "7-Zip",
    });
    const odd = app({
      id: "33333333-3333-3333-3333-333333333333",
      name: "Odd",
      detected: ["..\\evil.exe", "C:/x.exe"],
    });
    const entries = buildCatalog([keep, drop, odd], {
      excludedApps: [drop.id],
      programOverrides: {},
    });
    expect(catalogPrograms(entries)).toEqual(["acad.exe"]);
  });
  it("gives a list the same id in any order", () => {
    expect(catalogId(["b.exe", "a.exe"])).toBe(catalogId(["a.exe", "b.exe"]));
    expect(catalogId(["a.exe"])).toMatch(/^[0-9a-f]{8}$/);
    expect(catalogId(["a.exe"])).not.toBe(catalogId(["b.exe"]));
  });
  it("generates an ASCII Windows script with exactly the program list", async () => {
    const script = await collectorScript(["acad.exe", "photoshop.exe"]);
    expect(script).toContain(
      `$CatalogId = '${catalogId(["acad.exe", "photoshop.exe"])}'`,
    );
    expect(script).toContain("$Programs = @('acad.exe','photoshop.exe')");
    expect(script).not.toMatch(/LM_CATALOG_ID|LM_PROGRAMS/);
    expect(script).not.toMatch(/[^\x00-\x7f]/);
    expect(script).not.toMatch(/[^\r]\n/);
    await expect(
      collectorScript(["x'); Remove-Item C:\\ -Recurse #.exe"]),
    ).rejects.toThrow();
  });
});
