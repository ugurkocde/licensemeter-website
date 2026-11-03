import { describe, expect, it } from "vitest";

import {
  cleanPartNumber,
  isKnownFreeSku,
  SKU_CATALOG,
  skuDefaultPriceCents,
  skuDisplayName,
} from "./skuCatalog";

describe("SKU_CATALOG", () => {
  it.each([
    ["a929cd4d-8672-47c9-8664-159c1f322ba8", "Microsoft_Intune_Suite"],
    ["6432c818-bcef-43b6-9290-aec052964950", "M365_TEAMS_PREMIUM"],
    ["dcf0408c-aaec-446c-afd4-43e3683943ea", "Microsoft_365_E3_(no_Teams)"],
    ["b126b073-72db-4a9d-87a4-b17afe41d4ab", "MDATP_XPLAT"],
    ["e2aebe6c-897d-480f-9d62-fff1381581f7", "CPC_E_2C_8GB_128GB"],
    ["26124093-3d78-432b-b5dc-48bf992543d5", "IDENTITY_THREAT_PROTECTION"],
    ["2880026b-2b0c-4251-8656-5d41ff11e3aa", "DYN365_BUSCENTRAL_ESSENTIAL"],
  ])("maps %s to %s with a list price", (skuId, partNumber) => {
    const entry = SKU_CATALOG[skuId];
    expect(entry?.partNumber).toBe(partNumber);
    expect(entry?.free).toBeUndefined();
    expect(skuDefaultPriceCents(skuId)).toBeGreaterThan(0);
  });

  it("keeps GUIDs and part numbers unique", () => {
    const parts = Object.values(SKU_CATALOG).map((e) =>
      e.partNumber.toLowerCase(),
    );
    expect(new Set(parts).size).toBe(parts.length);
    for (const id of Object.keys(SKU_CATALOG)) {
      expect(id).toMatch(/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/);
    }
  });

  it("prices every known-free SKU at 0", () => {
    for (const entry of Object.values(SKU_CATALOG)) {
      if (entry.free) expect(entry.defaultMonthlyPriceCents).toBe(0);
    }
  });
});

describe("isKnownFreeSku", () => {
  it("flags catalog free SKUs by GUID and by part number", () => {
    expect(isKnownFreeSku("440eaaa8-b3e0-484b-a8be-62870b9ba70a")).toBe(true);
    expect(isKnownFreeSku(null, "WINDOWS_STORE")).toBe(true);
    expect(isKnownFreeSku(null, "flow_free")).toBe(true);
  });

  it("flags viral, trial and partner sandbox offers by name", () => {
    for (const part of [
      "Dynamics_365_Customer_Service_Enterprise_viral_trial",
      "Microsoft_Cloud_for_Sustainability_vTrial",
      "AX7_USER_TRIAL",
      "Dynamics_365_Business_Central_Partner_Sandbox",
      "POWER_VIRTUAL_AGENTS_VIRAL",
    ]) {
      expect(isKnownFreeSku("unknown-guid", part)).toBe(true);
    }
  });

  it("does not treat paid or unknown SKUs as free", () => {
    expect(
      isKnownFreeSku("05e9a617-0261-4cee-bb44-138d3ef5d965", "SPE_E3"),
    ).toBe(false);
    expect(isKnownFreeSku("unknown-guid", "SOME_NEW_ADDON")).toBe(false);
    expect(isKnownFreeSku("unknown-guid", "Microsoft_Teams_Premium")).toBe(
      false,
    );
    expect(
      isKnownFreeSku(
        "unknown-guid",
        "Dynamics_365_for_Operations_Sandbox_Tier2_SKU",
      ),
    ).toBe(false);
    expect(isKnownFreeSku("unknown-guid")).toBe(false);
  });
});

describe("unknown SKUs", () => {
  it("fall back to a prettified part number and a price of 0", () => {
    expect(skuDisplayName("unknown-guid", "SOME_NEW_ADDON")).toBe(
      "Some NEW Addon",
    );
    expect(skuDefaultPriceCents("unknown-guid")).toBe(0);
  });
});

describe("cleanPartNumber", () => {
  it("strips zero-width characters and surrounding space", () => {
    expect(cleanPartNumber("CPC_E_2C_8GB_128GB​")).toBe("CPC_E_2C_8GB_128GB");
    expect(cleanPartNumber(" ﻿SPE_E3‌‍ ")).toBe("SPE_E3");
  });
});
