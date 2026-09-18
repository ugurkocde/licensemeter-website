import { describe, expect, it } from "vitest";

import { adobePriceKey, analyzeAdobeWaste } from "./analyze";

const PRICES = {
  [adobePriceKey("Creative Cloud All Apps")]: 7100,
  [adobePriceKey("Acrobat Pro")]: 2000,
};

const entra = (upn: string, accountEnabled: boolean) => ({
  graphId: `graph-${upn.toLowerCase()}`,
  upn,
  displayName: upn.split("@")[0]!,
  accountEnabled,
});

describe("analyzeAdobeWaste", () => {
  it("produces no findings without a synced directory to correlate against", () => {
    const findings = analyzeAdobeWaste(
      [
        {
          email: "anyone@corp.example",
          status: "active",
          products: ["Acrobat Pro"],
        },
      ],
      [],
      PRICES,
    );
    expect(findings).toEqual([]);
  });

  it("flags Adobe seats held by Entra-disabled users with summed impact", () => {
    const findings = analyzeAdobeWaste(
      [
        {
          email: "Gone.User@corp.example",
          status: "active",
          products: ["Creative Cloud All Apps", "Acrobat Pro"],
        },
      ],
      [entra("gone.user@corp.example", false)],
      PRICES,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.rule).toBe("adobe_disabled_in_entra");
    expect(findings[0]!.monthlyImpactCents).toBe(9100);
    // Drill-down linkage: the finding carries the matched directory user's
    // graph id so /app/users/[id] can surface it.
    expect(findings[0]!.graphUserId).toBe("graph-gone.user@corp.example");
  });

  it("flags Adobe seats with no Entra account at all", () => {
    const findings = analyzeAdobeWaste(
      [
        {
          email: "freelancer@agency.example",
          status: "active",
          products: ["Acrobat Pro"],
        },
      ],
      [entra("someone.else@corp.example", true)],
      PRICES,
    );
    expect(findings.map((f) => f.rule)).toEqual(["adobe_orphaned"]);
    expect(findings[0]!.monthlyImpactCents).toBe(2000);
    // Orphans have no directory user to link to.
    expect(findings[0]!.graphUserId).toBeNull();
  });

  it("ignores healthy seats and non-active Adobe users", () => {
    const findings = analyzeAdobeWaste(
      [
        {
          email: "active.user@corp.example",
          status: "active",
          products: ["Acrobat Pro"],
        },
        {
          email: "removed.already@corp.example",
          status: "removed",
          products: ["Acrobat Pro"],
        },
      ],
      [entra("Active.User@corp.example", true)],
      PRICES,
    );
    expect(findings).toHaveLength(0);
  });

  it("prices unknown products at zero without failing", () => {
    const findings = analyzeAdobeWaste(
      [{ email: "x@y.example", status: "active", products: ["Substance 3D"] }],
      [entra("someone.else@y.example", true)],
      PRICES,
    );
    expect(findings[0]!.monthlyImpactCents).toBe(0);
  });
});
