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
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("backs off and retries rate-limited Adobe group pages", async () => {
    const sleepMock = vi.fn(() => Promise.resolve());
    const groupPageAttempts = new Map<number, number>();
    const groupPagePattern =
      /^https:\/\/usermanagement\.adobe\.io\/v2\/usermanagement\/groups\/org-123\/(\d+)$/;
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = fetchUrl(input);
      if (url === "https://ims-na1.adobelogin.com/ims/token/v3") {
        return Response.json({ access_token: "token" });
      }
      const groupMatch = groupPagePattern.exec(url);
      if (groupMatch) {
        const page = Number(groupMatch[1]!);
        groupPageAttempts.set(page, (groupPageAttempts.get(page) ?? 0) + 1);
        if (page === 5 && groupPageAttempts.get(page) === 1) {
          return new Response(null, {
            status: 429,
            headers: { "Retry-After": "2" },
          });
        }
        return Response.json({
          lastPage: page === 5,
          groups: [
            { type: "USER_GROUP", groupName: `Team ${page}` },
            { type: "PRODUCT_PROFILE", groupName: `Profile ${page}` },
          ],
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
              email: "large-org-user@example.com",
              status: "active",
              groups: ["Team 5", "Profile 0", "Profile 5"],
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
      sleep: sleepMock,
    }).getUsers();

    expect(sleepMock).toHaveBeenCalledTimes(1);
    expect(sleepMock).toHaveBeenCalledWith(2000);
    expect(groupPageAttempts.get(5)).toBe(2);
    expect(users).toEqual([
      {
        email: "large-org-user@example.com",
        status: "active",
        products: ["Profile 0", "Profile 5"],
      },
    ]);
  });

  it("fails before user import when the Adobe group catalog exceeds the safe page limit", async () => {
    const groupPagePattern =
      /^https:\/\/usermanagement\.adobe\.io\/v2\/usermanagement\/groups\/org-123\/(\d+)$/;
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = fetchUrl(input);
      if (url === "https://ims-na1.adobelogin.com/ims/token/v3") {
        return Response.json({ access_token: "token" });
      }
      if (groupPagePattern.test(url)) {
        return Response.json({
          lastPage: false,
          groups: [{ type: "PRODUCT_PROFILE", groupName: "Creative Cloud" }],
        });
      }
      throw new Error(`Unexpected request ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      new UmapiClient({
        orgId: "org-123",
        clientId: "client-id",
        clientSecret: "secret",
      }).getUsers(),
    ).rejects.toThrow("group catalog exceeds 20 pages");

    const requestedUrls = fetchMock.mock.calls.map(([input]) => fetchUrl(input));
    expect(
      requestedUrls.some((url) => url.includes("/users/org-123/")),
    ).toBe(false);
    expect(requestedUrls.filter((url) => groupPagePattern.test(url))).toHaveLength(
      20,
    );
  });

  it("fails before sleeping when Adobe rate-limit retry would exceed the budget", async () => {
    const sleepMock = vi.fn(() => Promise.resolve());
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = fetchUrl(input);
      if (url === "https://ims-na1.adobelogin.com/ims/token/v3") {
        return Response.json({ access_token: "token" });
      }
      if (
        url ===
        "https://usermanagement.adobe.io/v2/usermanagement/groups/org-123/0"
      ) {
        return new Response(null, {
          status: 429,
          headers: { "Retry-After": "300" },
        });
      }
      throw new Error(`Unexpected request ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      new UmapiClient({
        orgId: "org-123",
        clientId: "client-id",
        clientSecret: "secret",
        sleep: sleepMock,
      }).getUsers(),
    ).rejects.toThrow("rate-limit retry budget");

    expect(sleepMock).not.toHaveBeenCalled();
  });
});
