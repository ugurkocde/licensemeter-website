import { describe, expect, it, vi } from "vitest";

import { renewalAlertsApply, type SkuTermSetting } from "~/lib/renewalTerm";
import { renewalAlertHtml } from "~/server/email";
import {
  alertEligible,
  alertPeriodKey,
  dueRenewalAlerts,
  RENEWAL_THRESHOLDS,
  renewalAlertMessage,
  renewsWhen,
  thresholdFor,
  verdictOf,
} from "./alerts";
import {
  buildRenewalPlan,
  type PlanContract,
  type PlanInput,
  type PlanSku,
} from "./plan";

vi.mock("server-only", () => ({}));
vi.mock("~/env", () => ({
  env: { NODE_ENV: "test", AUTH_SECRET: "test-secret-test-secret-test-secret" },
  siteUrl: () => "https://licensemeter.test",
  billingEnabled: () => true,
}));
// Pure tests: nothing here may open the development database.
vi.mock("~/server/db", () => ({ db: {} }));

const NOW = new Date("2027-01-10T09:00:00Z");
const E3 = "05e9a617-0261-4cee-bb44-138d3ef5d965";
const VISIO = "c5928f49-12ba-48f7-ada3-0d743a3601d5";
const COPILOT = "639dec6b-bb19-468b-871c-c5c441c4b0cb";

const inDays = (days: number) => new Date(NOW.getTime() + days * 86_400_000);
const isoInDays = (days: number) => inDays(days).toISOString().slice(0, 10);

const sku = (overrides: Partial<PlanSku> = {}): PlanSku => ({
  skuId: E3,
  skuPartNumber: "SPE_E3",
  displayName: "Microsoft 365 E3",
  prepaidEnabled: 100,
  consumedUnits: 90,
  trialUnits: 0,
  nextLifecycleAt: inDays(60),
  ...overrides,
});

const contract = (overrides: Partial<PlanContract> = {}): PlanContract => ({
  id: "6f1c2a52-0b47-4a43-9d6a-5d1f3c9e7a10",
  vendor: "Microsoft",
  contractName: "Enterprise Agreement",
  renewalDate: isoInDays(90),
  noticeDays: 30,
  skuIds: [E3],
  targetSeats: null,
  ...overrides,
});

const plan = (overrides: Partial<PlanInput> = {}) =>
  buildRenewalPlan({
    skus: [sku()],
    contracts: [],
    findings: [],
    priceCents: () => 3_360,
    vendorProducts: [],
    terms: new Map(),
    bufferPct: 5,
    usageConcealed: false,
    now: NOW,
    ...overrides,
  });

const terms = (entries: Record<string, SkuTermSetting>) =>
  new Map(Object.entries(entries));

describe("thresholdFor", () => {
  it("hits each threshold on its exact day", () => {
    expect(thresholdFor(90)).toBe(90);
    expect(thresholdFor(60)).toBe(60);
    expect(thresholdFor(30)).toBe(30);
  });

  it("gives every day to the threshold above it, so a missed run catches up", () => {
    expect(thresholdFor(89)).toBe(90);
    expect(thresholdFor(61)).toBe(90);
    expect(thresholdFor(59)).toBe(60);
    expect(thresholdFor(31)).toBe(60);
    expect(thresholdFor(29)).toBe(30);
    expect(thresholdFor(1)).toBe(30);
    expect(thresholdFor(0)).toBe(30);
  });

  it("sends nothing beyond 90 days, after the renewal or for bad input", () => {
    expect(thresholdFor(91)).toBeNull();
    expect(thresholdFor(365)).toBeNull();
    expect(thresholdFor(-1)).toBeNull();
    expect(thresholdFor(Number.NaN)).toBeNull();
    expect(thresholdFor(30.5)).toBeNull();
  });

  it("uses only the thresholds it is given", () => {
    expect(thresholdFor(31, [30])).toBeNull();
    expect(thresholdFor(30, [30])).toBe(30);
    expect(thresholdFor(5, [30])).toBe(30);
  });

  it("keeps the three thresholds the product promises", () => {
    expect([...RENEWAL_THRESHOLDS]).toEqual([90, 60, 30]);
  });

  it("walks one renewal through exactly three reminders", () => {
    const seen = new Set<number>();
    for (let days = 120; days >= 0; days--) {
      const t = thresholdFor(days);
      if (t !== null) seen.add(t);
    }
    expect([...seen]).toEqual([90, 60, 30]);
  });
});

describe("renewalAlertsApply drives which SKUs get reminders", () => {
  it("covers an annual term by default, with nothing stored", () => {
    expect(renewalAlertsApply(undefined)).toBe(true);
    const due = dueRenewalAlerts(plan().items);
    expect(due.map((d) => [d.item.key, d.threshold])).toEqual([
      [`sku-${E3}`, 60],
    ]);
  });

  it("covers an explicit annual term", () => {
    const due = dueRenewalAlerts(
      plan({ terms: terms({ [E3]: { term: "annual", monthlyAlerts: false } }) })
        .items,
    );
    expect(due).toHaveLength(1);
  });

  it("skips a monthly NCE term without the opt-in", () => {
    const items = plan({
      skus: [sku({ nextLifecycleAt: inDays(20) })],
      terms: terms({ [E3]: { term: "monthly", monthlyAlerts: false } }),
    }).items;
    expect(items).toHaveLength(1);
    expect(items[0]!.alertsApply).toBe(false);
    expect(dueRenewalAlerts(items)).toEqual([]);
  });

  it("covers a monthly NCE term only when opted in, and only at 30 days", () => {
    const opted = terms({ [E3]: { term: "monthly", monthlyAlerts: true } });
    expect(
      dueRenewalAlerts(
        plan({ skus: [sku({ nextLifecycleAt: inDays(20) })], terms: opted })
          .items,
      ).map((d) => d.threshold),
    ).toEqual([30]);
    // A 31 day month would otherwise send a 60 day reminder as well.
    expect(
      dueRenewalAlerts(
        plan({ skus: [sku({ nextLifecycleAt: inDays(31) })], terms: opted })
          .items,
      ),
    ).toEqual([]);
    expect(
      dueRenewalAlerts(
        plan({ skus: [sku({ nextLifecycleAt: inDays(85) })], terms: opted })
          .items,
      ),
    ).toEqual([]);
  });

  it("decides per SKU in the same plan", () => {
    const due = dueRenewalAlerts(
      plan({
        skus: [
          sku({ nextLifecycleAt: inDays(30) }),
          sku({
            skuId: VISIO,
            skuPartNumber: "VISIOCLIENT",
            displayName: "Visio Plan 2",
            prepaidEnabled: 10,
            consumedUnits: 10,
            nextLifecycleAt: inDays(30),
          }),
          sku({
            skuId: COPILOT,
            skuPartNumber: "Microsoft_365_Copilot",
            displayName: "Microsoft 365 Copilot",
            prepaidEnabled: 20,
            consumedUnits: 20,
            nextLifecycleAt: inDays(30),
          }),
        ],
        terms: terms({
          [VISIO]: { term: "monthly", monthlyAlerts: false },
          [COPILOT]: { term: "monthly", monthlyAlerts: true },
        }),
      }).items,
    );
    expect(due.map((d) => d.item.key).sort()).toEqual(
      [`sku-${COPILOT}`, `sku-${E3}`].sort(),
    );
  });

  it("always covers contracts, also when a linked SKU is monthly", () => {
    const due = dueRenewalAlerts(
      plan({
        contracts: [contract()],
        terms: terms({ [E3]: { term: "monthly", monthlyAlerts: false } }),
      }).items,
    );
    expect(due.map((d) => [d.item.kind, d.threshold])).toEqual([
      ["contract", 90],
    ]);
  });
});

describe("alertEligible", () => {
  it("needs paid seats and a covered term", () => {
    expect(
      alertEligible({ alertsApply: true, trialOnly: false, paidSeats: 1 }),
    ).toBe(true);
    expect(
      alertEligible({ alertsApply: false, trialOnly: false, paidSeats: 10 }),
    ).toBe(false);
    expect(
      alertEligible({ alertsApply: true, trialOnly: true, paidSeats: 0 }),
    ).toBe(false);
    expect(
      alertEligible({ alertsApply: true, trialOnly: false, paidSeats: 0 }),
    ).toBe(false);
  });

  it("leaves trial-only subscriptions out: nothing paid renews", () => {
    const items = plan({
      skus: [sku({ prepaidEnabled: 25, trialUnits: 25, consumedUnits: 3 })],
    }).items;
    expect(items[0]!.trialOnly).toBe(true);
    expect(dueRenewalAlerts(items)).toEqual([]);
  });

  it("leaves renewals that already passed and far-off ones out", () => {
    expect(
      dueRenewalAlerts(
        plan({ skus: [sku({ nextLifecycleAt: inDays(200) })] }).items,
      ),
    ).toEqual([]);
    expect(
      dueRenewalAlerts(
        plan({ skus: [sku({ nextLifecycleAt: inDays(-3) })] }).items,
      ),
    ).toEqual([]);
  });

  it("still reminds about a renewal with nothing to cut", () => {
    const due = dueRenewalAlerts(
      plan({ skus: [sku({ prepaidEnabled: 90, consumedUnits: 90 })] }).items,
    );
    expect(due).toHaveLength(1);
    expect(due[0]!.item.cutSeats).toBe(0);
  });
});

describe("alertPeriodKey", () => {
  it("differs per threshold and per renewal date, so each goes out once", () => {
    const [due] = dueRenewalAlerts(plan().items);
    expect(alertPeriodKey(due!)).toBe(`sku-${E3}:${isoInDays(60)}:60`);
    expect(alertPeriodKey({ ...due!, threshold: 30 })).not.toBe(
      alertPeriodKey(due!),
    );
    const [nextYear] = dueRenewalAlerts(
      plan({ now: inDays(365), skus: [sku({ nextLifecycleAt: inDays(425) })] })
        .items,
    );
    expect(nextYear!.threshold).toBe(60);
    expect(alertPeriodKey(nextYear!)).not.toBe(alertPeriodKey(due!));
  });
});

describe("message copy", () => {
  it("names the day relative to today", () => {
    expect(renewsWhen(0)).toBe("renews today");
    expect(renewsWhen(1)).toBe("renews tomorrow");
    expect(renewsWhen(60)).toBe("renews in 60 days");
  });

  it("states the cut and the savings, and never invents money", () => {
    const [cut] = plan().items;
    // 100 paid, 90 active, 5 percent buffer: renew at 95, cut 5.
    expect(verdictOf(cut!, "USD")).toBe("Cut 5 seats and save $2,016 a year.");
    const [unpriced] = plan({ priceCents: () => 0 }).items;
    expect(verdictOf(unpriced!, "USD")).toBe("Cut 5 seats.");
    const [none] = plan({
      skus: [sku({ prepaidEnabled: 90, consumedUnits: 90 })],
    }).items;
    expect(verdictOf(none!, "USD")).toBe(
      "Renew at 90 seats: nothing to cut right now.",
    );
  });

  it("builds subject, body and the renewal's own calendar file", () => {
    const [due] = dueRenewalAlerts(plan().items);
    const message = renewalAlertMessage(
      { id: "t-1", name: "Contoso", tid: null, currency: "USD" },
      due!,
      NOW,
    );
    expect(message.subject).toBe(
      "Microsoft renewal in 60 days: Microsoft 365 E3, save $2,016/yr",
    );
    expect(message.attachments).toHaveLength(1);
    expect(message.attachments[0]!.filename).toBe("microsoft-365-e3.ics");
    const ics = Buffer.from(message.attachments[0]!.content, "base64").toString(
      "utf8",
    );
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain(`UID:t-1.sku-${E3}.renewal@licensemeter`);
    expect(ics).toContain(`UID:t-1.sku-${E3}.notice@licensemeter`);
    const html = message.html({
      workspaceName: "Contoso",
      emailLabel: "renewal reminders",
      unsubscribeUrl: "https://licensemeter.test/api/unsubscribe?x=1",
      settingsUrl: "https://licensemeter.test/settings",
    });
    expect(html).toContain("Microsoft 365 E3 renews in 60 days");
    expect(html).toContain("Cut 5 seats and save $2,016 a year.");
    expect(html).toContain("Decide on the seat count by");
    expect(html).toContain("Unsubscribe from the renewal reminders");
  });

  it("says when the notice deadline has passed", () => {
    const [due] = dueRenewalAlerts(
      plan({
        contracts: [contract({ renewalDate: isoInDays(20), noticeDays: 30 })],
      }).items,
    );
    expect(due!.item.noticeDaysUntil).toBeLessThan(0);
    const html = renewalAlertMessage(
      { id: "t-1", name: "Contoso", tid: null, currency: "USD" },
      due!,
      NOW,
    ).html({
      workspaceName: "Contoso",
      emailLabel: "renewal reminders",
      unsubscribeUrl: "https://licensemeter.test/u",
      settingsUrl: "https://licensemeter.test/s",
    });
    expect(html).toContain("The notice deadline");
    expect(html).toContain("has passed");
  });

  it("escapes names that come from the workspace", () => {
    const html = renewalAlertHtml({
      tenantName: "<Acme>",
      vendor: "Adobe & Co",
      label: '<img src=x onerror="1">',
      kind: "Contract",
      when: "renews in 30 days",
      renewalDate: "09 Feb 2027",
      noticeDate: "10 Jan 2027",
      noticePassed: false,
      rows: [{ label: "Paid seats", value: "10" }],
      verdict: "Cut 1 seat.",
      estimate: true,
      appUrl: "https://licensemeter.test",
      footer: {
        workspaceName: "<Acme>",
        emailLabel: "renewal reminders",
        unsubscribeUrl: "https://licensemeter.test/u",
        settingsUrl: "https://licensemeter.test/s",
        shared: true,
      },
    });
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<Acme>");
    expect(html).toContain("Adobe &amp; Co");
    expect(html).toContain("Conservative estimate");
    expect(html).toContain("shared notification address");
  });
});
