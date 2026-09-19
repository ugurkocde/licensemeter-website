import { describe, expect, it } from "vitest";

import {
  buildDpa,
  DPA_VERSION,
  signedDpaFilename,
  type DpaCounterparty,
  type DpaLang,
} from "~/lib/dpa";

const COUNTERPARTY: DpaCounterparty = {
  kind: "controller",
  companyName: "Contoso GmbH",
  companyAddress: "Musterstrasse 1, 10115 Berlin, Germany",
  signerName: "Dana Example",
  signerTitle: "Head of IT",
  signerEmail: "dana@contoso.example",
  signedAt: new Date("2026-09-19T09:30:00Z"),
};

const LANGS: DpaLang[] = ["en", "de"];

describe("buildDpa with a counterparty", () => {
  it.each(LANGS)("names the company in Annex I (%s)", (lang) => {
    const doc = buildDpa(lang, COUNTERPARTY);
    const annexI = doc.annexes.find((a) => a.id === "I");
    const controller = annexI?.parties?.[0];
    const values = controller?.fields.map((f) => f.def).join("\n") ?? "";

    expect(values).toContain("Contoso GmbH");
    expect(values).toContain("Musterstrasse 1, 10115 Berlin, Germany");
    expect(values).toContain("Dana Example");
    expect(values).toContain("dana@contoso.example");
  });

  it.each(LANGS)("names the company in the signature block (%s)", (lang) => {
    const doc = buildDpa(lang, COUNTERPARTY);
    const lines = doc.signature.controller.lines;

    expect(lines[0]).toBe("Contoso GmbH");
    expect(lines.join("\n")).toContain("Dana Example");
    expect(lines.join("\n")).toContain("Head of IT");
    expect(lines.join("\n")).toContain(`Version ${DPA_VERSION}`);
    // The signed intro replaces the pre-signed one.
    expect(doc.signature.intro).not.toBe(buildDpa(lang).signature.intro);
  });

  it.each(LANGS)("keeps the standard copy free of any company (%s)", (lang) => {
    const doc = buildDpa(lang);
    expect(JSON.stringify(doc)).not.toContain("Contoso");
    expect(doc.signature.controller.lines.join("\n")).toContain("____");
  });

  it("adds the MSP role statement only for the sub-processor kind", () => {
    const controller = buildDpa("en", COUNTERPARTY);
    const subprocessor = buildDpa("en", {
      ...COUNTERPARTY,
      kind: "subprocessor",
    });
    expect(controller.annexes[0]?.intro).toBeUndefined();
    expect(subprocessor.annexes[0]?.intro?.length).toBe(1);
  });
});

describe("signedDpaFilename", () => {
  it("slugs the company name and carries the version", () => {
    expect(signedDpaFilename("en", "Contoso GmbH & Co. KG")).toBe(
      `LicenseMeter-DPA-en-contoso-gmbh-co-kg-v${DPA_VERSION}.pdf`,
    );
    expect(signedDpaFilename("de", "Müller Straßenbau")).toBe(
      `LicenseMeter-AVV-de-muller-stra-enbau-v${DPA_VERSION}.pdf`,
    );
  });

  it("never yields an empty slug or an overlong one", () => {
    expect(signedDpaFilename("en", "***")).toBe(
      `LicenseMeter-DPA-en-company-v${DPA_VERSION}.pdf`,
    );
    const long = signedDpaFilename("en", "a ".repeat(60));
    expect(long.length).toBeLessThan(80);
    expect(long).not.toContain("--");
  });
});
