import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { unpricedSkuCount } from "~/server/waste/engine";
import { UnpricedNotice } from "./UnpricedNotice";

const sku = (
  skuId: string,
  skuPartNumber: string,
  prepaidEnabled: number,
  consumedUnits: number,
  trialUnits = 0,
) => ({ skuId, skuPartNumber, prepaidEnabled, consumedUnits, trialUnits });

const E3 = "05e9a617-0261-4cee-bb44-138d3ef5d965";
const PHONE_RESOURCE = "440eaaa8-b3e0-484b-a8be-62870b9ba70a";
const UNKNOWN = "00000000-0000-0000-0000-00000000abcd";

const render = (
  skus: ReturnType<typeof sku>[],
  prices: Record<string, number>,
) =>
  renderToStaticMarkup(
    createElement(UnpricedNotice, {
      count: unpricedSkuCount(skus, (id) => prices[id] ?? 0),
    }),
  );

describe("UnpricedNotice", () => {
  it("counts paid and unknown SKUs with seats at 0 and links to the price editor", () => {
    const html = render(
      [
        sku(E3, "SPE_E3", 10, 10),
        sku(UNKNOWN, "SOME_NEW_ADDON", 0, 4),
        sku("another-unknown", "OTHER_ADDON", 5, 0),
      ],
      {},
    );
    expect(html).toContain(
      "3 licenses have no price yet, so waste is understated.",
    );
    expect(html).toContain('href="/app/licenses?pricing=unpriced"');
  });

  it("uses the singular for one license", () => {
    expect(render([sku(UNKNOWN, "SOME_NEW_ADDON", 1, 1)], {})).toContain(
      "1 license has no price yet",
    );
  });

  it("stays hidden for known-free, priced, seatless and capacity SKUs", () => {
    expect(
      render(
        [
          sku(PHONE_RESOURCE, "PHONESYSTEM_VIRTUALUSER", 20, 18),
          sku("viral", "Dynamics_365_Sales_Premium_Viral_Trial", 25, 1),
          sku(E3, "SPE_E3", 10, 10),
          sku(UNKNOWN, "SOME_NEW_ADDON", 0, 0),
          sku("capacity", "SOME_CAPACITY_SKU", 10_000, 3),
          sku("trial-only", "SOME_EVAL_ADDON", 25, 20, 25),
        ],
        { [E3]: 3670 },
      ),
    ).toBe("");
  });
});
