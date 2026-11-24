import { expect, it } from "vitest";

import { wasteShareLabel } from "./wasteShare";

it("compares Microsoft-only waste with spend", () => {
  expect(wasteShareLabel(10_250, [{ rule: "shelfware", cents: 9_225 }])).toBe(
    "90.0% of spend",
  );
});

it("uses only Microsoft waste when other connectors contribute priced findings", () => {
  expect(
    wasteShareLabel(100, [
      { rule: "shelfware", cents: 50 },
      { rule: "copilot_unused", cents: 20 },
      { rule: "adobe_orphaned", cents: 40 },
      { rule: "saas_orphaned", cents: 60 },
    ]),
  ).toBe("70.0% of Microsoft spend");
});

it("shows a zero Microsoft share when only another connector contributes waste", () => {
  expect(wasteShareLabel(100, [{ rule: "adobe_orphaned", cents: 40 }])).toBe(
    "0.0% of Microsoft spend",
  );
});

it("allows 100% without changing the label for unpriced findings", () => {
  expect(
    wasteShareLabel(100, [
      { rule: "shelfware", cents: 100 },
      { rule: "adobe_orphaned", cents: 0 },
    ]),
  ).toBe("100.0% of spend");
});

it("asks for a sync when Microsoft waste exceeds recorded spend", () => {
  expect(wasteShareLabel(100, [{ rule: "shelfware", cents: 101 }])).toBe(
    "More than recorded spend. Run a sync to refresh.",
  );
});

it("hides the share when there is no recorded spend", () => {
  expect(
    wasteShareLabel(0, [{ rule: "shelfware", cents: 50 }]),
  ).toBeUndefined();
});
