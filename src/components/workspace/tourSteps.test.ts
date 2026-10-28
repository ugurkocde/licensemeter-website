import { describe, expect, it } from "vitest";

import { NAV_TOUR_ANCHORS, dataTourSteps } from "./tourSteps";

describe("data tour", () => {
  it("points at every sidebar anchor NavLinks renders, in sidebar order", () => {
    // NavLinks tags Findings, Software Metering and Connectors with these
    // anchors; a step pointing anywhere else would silently drop out.
    const navSteps = dataTourSteps
      .map((step) => step.anchor)
      .filter((anchor) =>
        Object.values(NAV_TOUR_ANCHORS).includes(
          anchor as (typeof NAV_TOUR_ANCHORS)[keyof typeof NAV_TOUR_ANCHORS],
        ),
      );
    expect(navSteps).toEqual([
      NAV_TOUR_ANCHORS.findings,
      NAV_TOUR_ANCHORS.metering,
      NAV_TOUR_ANCHORS.connectors,
    ]);
  });

  it("has no duplicate anchors", () => {
    const anchors = dataTourSteps.map((step) => step.anchor);
    expect(new Set(anchors).size).toBe(anchors.length);
  });
});
