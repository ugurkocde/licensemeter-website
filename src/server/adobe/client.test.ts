import { afterEach, describe, expect, it, vi } from "vitest";

import { UmapiClient } from "./client";

const fetchUrl = (input: string | URL | Request): string => {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("UmapiClient", () => {
  it("keeps direct and indirect product-profile groups as Adobe products", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = fetchUrl(input);
      if (url === "https://ims-na1.adobelogin.com/ims/token/v3") {
        return Response.json({ access_token: "token" });
      }
      if (
        url ===
        "https://usermanagement.adobe.io/v2/usermanagement/groups/org-123/0"
      ) {
        return Response.json({
          lastPage: false,
          groups: [
            { type: "USER_GROUP", groupName: "Design Team" },
            { type: "PRODUCT_PROFILE", groupName: "Creative Cloud All Apps" },
            {
              type: "PRODUCT_ADMIN_GROUP",
              groupName: "_product_admin_Creative Cloud All Apps",
            },
          ],
        });
      }
      if (
        url ===
        "https://usermanagement.adobe.io/v2/usermanagement/groups/org-123/1"
      ) {
        return Response.json({
          lastPage: true,
          groups: [{ type: "PRODUCT_PROFILE", groupName: "Acrobat Pro" }],
        });
      }
      if (
        url ===
        "https://usermanagement.adobe.io/v2/usermanagement/users/org-123/0?directOnly=false"
      ) {
        return Response.json({
          lastPage: true,
          users: [
            {
              email: "direct@example.com",
              status: "active",
              groups: [
                "Design Team",
                "Creative Cloud All Apps",
                "_product_admin_Creative Cloud All Apps",
              ],
            },
            {
              email: "indirect@example.com",
              status: "active",
              groups: [
                "Design Team",
                "Acrobat Pro",
              ],
            },
            {
              email: "admin-only@example.com",
              status: "active",
              groups: ["Design Team", "_product_admin_Creative Cloud All Apps"],
            },
          ],
        });
      }
      throw new Error(`Unexpected request ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const users = await new UmapiClient({
      orgId: "org-123",
      clientId: "client-id",
      clientSecret: "secret",
    }).getUsers();

    expect(users).toEqual([
      {
        email: "direct@example.com",
        status: "active",
        products: ["Creative Cloud All Apps"],
      },
      {
        email: "indirect@example.com",
        status: "active",
        products: ["Acrobat Pro"],
      },
      {
        email: "admin-only@example.com",
        status: "active",
        products: [],
      },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
