import { describe, expect, it } from "vitest";

import { analyzeSaasWaste, saasPriceKey } from "~/server/saas/analyze";
import { mapAtlassianUsers } from "~/server/saas/atlassian";
import {
  mapSalesforceRecords,
  normalizeSalesforceOrgRef,
  validSalesforceUrl,
} from "~/server/saas/salesforce";
import { mapZoomUsers } from "~/server/saas/zoom";
import type { SaasSeat } from "~/server/types";

const NOW = new Date("2026-06-12T00:00:00Z");
const daysAgo = (n: number) =>
  new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);

const seat = (overrides: Partial<SaasSeat>): SaasSeat => ({
  email: "user@example.com",
  displayName: null,
  status: "active",
  products: ["Licensed"],
  lastActiveAt: null,
  ...overrides,
});

const ENTRA = [
  {
    graphId: "graph-active",
    upn: "active@example.com",
    displayName: "Active A",
    accountEnabled: true,
  },
  {
    graphId: "graph-gone",
    upn: "gone@example.com",
    displayName: "Gone G",
    accountEnabled: false,
  },
];

const PRICES = {
  "zoom:Licensed": 1399,
  "atlassian:Jira Software": 800,
  "atlassian:Confluence": 600,
  "salesforce:Salesforce": 16500,
};

describe("analyzeSaasWaste", () => {
  it("flags seats whose Entra account is disabled, with summed product prices", () => {
    const findings = analyzeSaasWaste(
      "atlassian",
      [seat({ email: "gone@example.com", products: ["Jira Software", "Confluence"] })],
      ENTRA,
      PRICES,
      { inactiveDays: 90, now: NOW },
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.rule).toBe("saas_disabled_in_entra");
    expect(findings[0]!.monthlyImpactCents).toBe(1400);
    expect(findings[0]!.title).toContain("Atlassian");
    // Drill-down linkage: the finding carries the matched directory user's
    // graph id so /app/users/[id] can surface it.
    expect(findings[0]!.graphUserId).toBe("graph-gone");
  });

  it("flags orphans with no directory account", () => {
    const findings = analyzeSaasWaste(
      "zoom",
      [seat({ email: "nobody@example.com" })],
      ENTRA,
      PRICES,
      { inactiveDays: 90, now: NOW },
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.rule).toBe("saas_orphaned");
    expect(findings[0]!.dedupeKey).toBe("saas_orphaned|zoom:nobody@example.com|-");
    // Orphans have no directory user to link to.
    expect(findings[0]!.graphUserId).toBeNull();
  });

  it("flags inactive seats only past the threshold", () => {
    const make = (last: Date | null) =>
      analyzeSaasWaste(
        "zoom",
        [seat({ email: "active@example.com", lastActiveAt: last })],
        ENTRA,
        PRICES,
        { inactiveDays: 90, now: NOW },
      );
    expect(make(daysAgo(150))).toHaveLength(1);
    expect(make(daysAgo(150))[0]!.rule).toBe("saas_inactive");
    // Inactivity findings only exist for matched directory users, so they
    // always link to the drill-down page.
    expect(make(daysAgo(150))[0]!.graphUserId).toBe("graph-active");
    expect(make(daysAgo(30))).toHaveLength(0);
  });

  it("produces no inactivity finding without an activity signal", () => {
    const findings = analyzeSaasWaste(
      "zoom",
      [seat({ email: "active@example.com", lastActiveAt: null })],
      ENTRA,
      PRICES,
      { inactiveDays: 90, now: NOW },
    );
    expect(findings).toHaveLength(0);
  });

  it("ignores non-active seats and matches emails case-insensitively", () => {
    const findings = analyzeSaasWaste(
      "zoom",
      [
        seat({ email: "GONE@example.com" }),
        seat({ email: "gone2@example.com", status: "deactivated" }),
      ],
      ENTRA,
      PRICES,
      { inactiveDays: 90, now: NOW },
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.rule).toBe("saas_disabled_in_entra");
  });

  it("prices unknown products at zero instead of failing", () => {
    const findings = analyzeSaasWaste(
      "zoom",
      [seat({ email: "gone@example.com", products: ["Webinar 500"] })],
      ENTRA,
      {},
      { inactiveDays: 90, now: NOW },
    );
    expect(findings[0]!.monthlyImpactCents).toBe(0);
  });
});

describe("provider mappers", () => {
  it("zoom keeps only Licensed users and parses last login", () => {
    const seats = mapZoomUsers([
      { email: "a@x.com", type: 2, first_name: "A", last_name: "B", status: "active", last_login_time: "2026-05-01T10:00:00Z" },
      { email: "basic@x.com", type: 1 },
      { type: 2 },
    ]);
    expect(seats).toHaveLength(1);
    expect(seats[0]).toMatchObject({
      email: "a@x.com",
      displayName: "A B",
      products: ["Licensed"],
    });
    expect(seats[0]!.lastActiveAt?.toISOString()).toBe("2026-05-01T10:00:00.000Z");
  });

  it("atlassian keeps active users with product access and takes the freshest activity", () => {
    const seats = mapAtlassianUsers([
      {
        email: "a@x.com",
        name: "A",
        account_status: "active",
        product_access: [
          { key: "jira-software", name: "Jira Software", last_active: "2026-01-01T00:00:00Z" },
          { key: "confluence", name: "Confluence", last_active: "2026-03-01T00:00:00Z" },
        ],
      },
      { email: "no-products@x.com", account_status: "active", product_access: [] },
      { email: "suspended@x.com", account_status: "suspended", product_access: [{ name: "Jira Software" }] },
    ]);
    expect(seats).toHaveLength(1);
    expect(seats[0]!.products).toEqual(["Jira Software", "Confluence"]);
    expect(seats[0]!.lastActiveAt?.toISOString()).toBe("2026-03-01T00:00:00.000Z");
  });

  it("atlassian maps never-active users to a null signal", () => {
    const seats = mapAtlassianUsers([
      {
        email: "fresh@x.com",
        account_status: "active",
        product_access: [{ name: "Jira Software" }],
      },
    ]);
    expect(seats[0]!.lastActiveAt).toBeNull();
  });

  it("salesforce maps license names and falls back to Salesforce", () => {
    const seats = mapSalesforceRecords([
      {
        Email: "a@x.com",
        Name: "A",
        LastLoginDate: "2026-04-01T00:00:00Z",
        Profile: { UserLicense: { Name: "Salesforce Platform" } },
      },
      { Email: "b@x.com", Name: "B", LastLoginDate: null, Profile: null },
    ]);
    expect(seats[0]!.products).toEqual(["Salesforce Platform"]);
    expect(seats[1]!.products).toEqual(["Salesforce"]);
    expect(seats[1]!.lastActiveAt).toBeNull();
  });

  it("salesforce URL guard accepts production and sandbox https My Domain hosts", () => {
    expect(validSalesforceUrl("https://acme.my.salesforce.com")).not.toBeNull();
    expect(
      validSalesforceUrl("https://acme--sb.sandbox.my.salesforce.com"),
    ).not.toBeNull();
    expect(validSalesforceUrl("http://acme.my.salesforce.com")).toBeNull();
    expect(validSalesforceUrl("https://evil.example.com")).toBeNull();
    expect(validSalesforceUrl("https://my.salesforce.com.evil.example")).toBeNull();
    expect(validSalesforceUrl("https://acme.my.salesforce.com:8080")).toBeNull();
    expect(validSalesforceUrl("https://acme.my.salesforce.com/path")).toBeNull();
    expect(validSalesforceUrl("not a url")).toBeNull();
  });

  it("salesforce orgRef normalization accepts address-bar copy shapes", () => {
    const ORIGIN = "https://acme.my.salesforce.com";
    const SANDBOX_ORIGIN = "https://acme--sb.sandbox.my.salesforce.com";
    expect(normalizeSalesforceOrgRef("acme.my.salesforce.com")).toBe(ORIGIN);
    expect(normalizeSalesforceOrgRef("  acme.my.salesforce.com  ")).toBe(ORIGIN);
    expect(normalizeSalesforceOrgRef("acme--sb.sandbox.my.salesforce.com")).toBe(
      SANDBOX_ORIGIN,
    );
    expect(
      normalizeSalesforceOrgRef(
        "https://acme--sb.sandbox.my.salesforce.com/lightning/setup",
      ),
    ).toBe(SANDBOX_ORIGIN);
    expect(
      normalizeSalesforceOrgRef("https://acme.my.salesforce.com/lightning/setup"),
    ).toBe(ORIGIN);
    expect(
      normalizeSalesforceOrgRef("https://acme.my.salesforce.com/?foo=1#bar"),
    ).toBe(ORIGIN);
    expect(normalizeSalesforceOrgRef("ACME.My.Salesforce.com")).toBe(ORIGIN);
    // Deliberate choice: a pasted http URL is upgraded to https rather than
    // rejected, because the host is still pinned to *.my.salesforce.com and the
    // stored origin (the only thing we ever fetch) is always https.
    expect(normalizeSalesforceOrgRef("http://acme.my.salesforce.com")).toBe(
      ORIGIN,
    );
  });

  it("salesforce orgRef normalization still rejects non-Salesforce hosts", () => {
    expect(normalizeSalesforceOrgRef("acme.salesforce.com.evil.com")).toBeNull();
    expect(normalizeSalesforceOrgRef("https://evil.example.com")).toBeNull();
    expect(
      normalizeSalesforceOrgRef("https://acme.my.salesforce.com:8080"),
    ).toBeNull();
    expect(normalizeSalesforceOrgRef("not a url")).toBeNull();
    expect(normalizeSalesforceOrgRef("")).toBeNull();
  });
});

describe("saasPriceKey", () => {
  it("namespaces products per provider", () => {
    expect(saasPriceKey("zoom", "Licensed")).toBe("zoom:Licensed");
  });
});
