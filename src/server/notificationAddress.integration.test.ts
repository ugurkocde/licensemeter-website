import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as schema from "~/server/db/schema";
import type * as EmailModule from "~/server/email";

/**
 * The shared notification address against a real Drizzle/PGlite database.
 * Only the Resend call is stubbed; the token, the transaction, the recipient
 * rules and the confirm route are the real thing.
 */

let currentDb: ReturnType<typeof makeDb>;

type SendArgs = { to: string[]; subject: string; html: string };
const sendEmailMock = vi.fn((_args: SendArgs) => Promise.resolve(true));

vi.mock("~/env", () => ({
  env: { NODE_ENV: "test", AUTH_SECRET: "test-secret-test-secret-test-secret" },
  siteUrl: () => "https://licensemeter.test",
}));

vi.mock("~/server/db", () => {
  const proxy = new Proxy(
    {},
    {
      get: (_t, prop) =>
        (currentDb as unknown as Record<string | symbol, unknown>)[prop],
    },
  );
  return { db: proxy, schema };
});

vi.mock("~/server/email", async (original) => ({
  ...(await original<typeof EmailModule>()),
  emailEnabled: () => true,
  sendEmail: (args: SendArgs) => sendEmailMock(args),
}));

const {
  confirmAddress,
  loadSharedAddress,
  removeSharedAddress,
  requestVerification,
  setSharedJob,
  sharedAddressSchema,
  sharedRecipient,
} = await import("~/server/notificationAddress");
const { workspaceEmailRecipients } = await import("~/server/workspaceEmail");
const { GET, POST } = await import("~/app/api/notifications/verify/route");

let cachedDdl: string[] | null = null;
async function schemaDdl(): Promise<string[]> {
  cachedDdl ??= await generateMigration(
    generateDrizzleJson({}),
    generateDrizzleJson(schema),
  );
  return cachedDdl;
}

function makeDb(client: PGlite) {
  return drizzle(client, { schema });
}

const TENANT_ID = "11111111-1111-1111-1111-111111111111";
const OTHER_ID = "22222222-2222-2222-2222-222222222222";
const SHARED = "it-licenses@contoso.test";

/** The one-use token as the recipient reads it out of the emailed link. */
const tokenOfLastEmail = (): string => {
  const last = sendEmailMock.mock.calls.at(-1)?.[0];
  return /token=([0-9a-f]{64})/.exec(last?.html ?? "")?.[1] ?? "";
};

const row = () => loadSharedAddress(TENANT_ID);

const confirmRequest = (
  workspace: string,
  token: string,
  method: "GET" | "POST" = "POST",
): Request => {
  const url = `https://licensemeter.test/api/notifications/verify?workspace=${workspace}&token=${token}`;
  if (method === "GET") return new Request(url);
  const form = new FormData();
  form.set("workspace", workspace);
  form.set("token", token);
  return new Request(url, { method: "POST", body: form });
};

/** Request and confirm in one step, for the tests that start from verified. */
const verifiedAddress = async (email = SHARED): Promise<void> => {
  await requestVerification(TENANT_ID, email);
  expect(await confirmAddress(TENANT_ID, tokenOfLastEmail())).toBe(true);
};

beforeEach(async () => {
  const client = new PGlite();
  for (const stmt of await schemaDdl()) await client.exec(stmt);
  currentDb = makeDb(client);
  sendEmailMock.mockReset();
  sendEmailMock.mockResolvedValue(true);
  await currentDb.insert(schema.tenants).values([
    { id: TENANT_ID, name: "Acme" },
    { id: OTHER_ID, name: "Beta" },
  ]);
});

describe("requestVerification", () => {
  it("stores only the hash of the token and mails the link", async () => {
    expect(await requestVerification(TENANT_ID, SHARED)).toBe(true);

    const token = tokenOfLastEmail();
    expect(token).toHaveLength(64);
    const pending = await row();
    expect(pending).toMatchObject({ pendingEmail: SHARED, email: null });
    expect(pending?.tokenHash).toHaveLength(64);
    expect(pending?.tokenHash).not.toBe(token);
    expect(pending?.tokenExpiresAt?.getTime()).toBeGreaterThan(Date.now());

    const [args] = sendEmailMock.mock.calls[0]!;
    expect(args.to).toEqual([SHARED]);
    expect(args.subject).toContain("Acme");
    expect(args.html).toContain("Acme");
    expect(args.html).toContain("account names and license costs");
    expect(args.html).toContain("expires in 24 hours");
  });

  it("clears only its own request when the mail does not go out", async () => {
    await verifiedAddress();
    sendEmailMock.mockRejectedValueOnce(new Error("provider down"));

    expect(await requestVerification(TENANT_ID, "other@contoso.test")).toBe(
      false,
    );
    const after = await row();
    expect(after?.pendingEmail).toBeNull();
    expect(after?.tokenHash).toBeNull();
    // The address that was already verified keeps its mail.
    expect(after?.email).toBe(SHARED);
    expect(await sharedRecipient(TENANT_ID, "digest")).toBe(SHARED);
  });

  it("leaves a newer request alone when an older send fails afterwards", async () => {
    // The second request is filed while the first send is still in flight.
    sendEmailMock.mockImplementationOnce(async () => {
      await requestVerification(TENANT_ID, "newer@contoso.test");
      throw new Error("provider down");
    });
    expect(await requestVerification(TENANT_ID, "first@contoso.test")).toBe(
      false,
    );

    const pending = await row();
    expect(pending?.pendingEmail).toBe("newer@contoso.test");
    expect(pending?.tokenHash).toHaveLength(64);
    expect(await confirmAddress(TENANT_ID, tokenOfLastEmail())).toBe(true);
    expect((await row())?.email).toBe("newer@contoso.test");
  });
});

describe("confirmAddress", () => {
  it("promotes the pending address and records who confirmed it", async () => {
    await requestVerification(TENANT_ID, SHARED);
    const token = tokenOfLastEmail();

    expect(await confirmAddress(TENANT_ID, token)).toBe(true);
    const after = await row();
    expect(after).toMatchObject({
      email: SHARED,
      pendingEmail: null,
      tokenHash: null,
      tokenExpiresAt: null,
    });
    expect(after?.verifiedAt).toBeInstanceOf(Date);

    const [entry] = await currentDb.query.auditLog.findMany();
    expect(entry).toMatchObject({
      action: "notification_address_verified",
      actorEmail: SHARED,
    });
    expect(JSON.stringify(entry)).not.toContain(token);
  });

  it("refuses an expired link", async () => {
    await requestVerification(TENANT_ID, SHARED);
    await currentDb
      .update(schema.notificationAddresses)
      .set({ tokenExpiresAt: new Date(Date.now() - 1000) })
      .where(eq(schema.notificationAddresses.tenantId, TENANT_ID));

    expect(await confirmAddress(TENANT_ID, tokenOfLastEmail())).toBe(false);
    expect((await row())?.email).toBeNull();
  });

  it("kills the older link when a request is replaced", async () => {
    await requestVerification(TENANT_ID, SHARED);
    const older = tokenOfLastEmail();
    await requestVerification(TENANT_ID, "newer@contoso.test");

    expect(await confirmAddress(TENANT_ID, older)).toBe(false);
    expect(await confirmAddress(TENANT_ID, tokenOfLastEmail())).toBe(true);
    expect((await row())?.email).toBe("newer@contoso.test");
  });

  it("spends a link once, and the second attempt fails cleanly", async () => {
    await requestVerification(TENANT_ID, SHARED);
    const token = tokenOfLastEmail();

    expect(await confirmAddress(TENANT_ID, token)).toBe(true);
    expect(await confirmAddress(TENANT_ID, token)).toBe(false);
    expect((await row())?.email).toBe(SHARED);
  });

  it("refuses a valid link pointed at another workspace", async () => {
    await requestVerification(TENANT_ID, SHARED);

    expect(await confirmAddress(OTHER_ID, tokenOfLastEmail())).toBe(false);
    expect((await row())?.email).toBeNull();
    expect(await loadSharedAddress(OTHER_ID)).toBeNull();
  });
});

describe("the confirm route", () => {
  it("changes nothing on GET, even with a valid link", async () => {
    await requestVerification(TENANT_ID, SHARED);
    const token = tokenOfLastEmail();

    const res = GET(confirmRequest(TENANT_ID, token, "GET"));
    const html = await res.text();
    expect(html).toContain("Confirm this address");
    expect(html).toContain('<form method="post"');
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(res.headers.get("X-Robots-Tag")).toBe("noindex");
    expect(res.headers.get("Content-Security-Policy")).toContain(
      "default-src 'none'",
    );
    expect((await row())?.email).toBeNull();

    // The link the scanner followed still works for the person.
    expect((await POST(confirmRequest(TENANT_ID, token))).status).toBe(200);
    expect((await row())?.email).toBe(SHARED);
  });

  it("answers every invalid link the same way", async () => {
    await requestVerification(TENANT_ID, SHARED);
    const forged = "a".repeat(64);
    const unknown = "99999999-9999-4999-8999-999999999999";
    const bodies = await Promise.all(
      [
        confirmRequest(TENANT_ID, forged),
        confirmRequest(unknown, forged),
        confirmRequest(unknown, tokenOfLastEmail()),
        confirmRequest("not-a-uuid", "short"),
      ].map(async (req) => (await POST(req)).text()),
    );
    expect(new Set(bodies).size).toBe(1);
    expect(bodies[0]).toContain("This link is not valid");
    expect((await row())?.email).toBeNull();
  });
});

describe("the shared address as a recipient", () => {
  it("is added to a job only while its own switch is on", async () => {
    await verifiedAddress();

    for (const job of ["digest", "report", "leak"] as const) {
      expect(await sharedRecipient(TENANT_ID, job)).toBe(SHARED);
      await setSharedJob(TENANT_ID, job, false);
      expect(await sharedRecipient(TENANT_ID, job)).toBeNull();
      await setSharedJob(TENANT_ID, job, true);
    }
    // One switch never touches the other two.
    await setSharedJob(TENANT_ID, "report", false);
    expect(await sharedRecipient(TENANT_ID, "digest")).toBe(SHARED);
    expect(await sharedRecipient(TENANT_ID, "leak")).toBe(SHARED);
  });

  it("keeps receiving mail while a replacement waits for confirmation", async () => {
    await verifiedAddress();
    await requestVerification(TENANT_ID, "newer@contoso.test");

    expect(await sharedRecipient(TENANT_ID, "digest")).toBe(SHARED);
    const { recipients } = await workspaceEmailRecipients(TENANT_ID, "digest");
    expect(recipients).toEqual([{ kind: "shared", email: SHARED }]);
  });

  it("is added next to the admins, once, with the membership winning", async () => {
    await currentDb.insert(schema.memberships).values([
      {
        tenantId: TENANT_ID,
        email: "anna@contoso.test",
        oid: "oid-anna",
        role: "owner",
      },
      {
        tenantId: TENANT_ID,
        email: SHARED,
        oid: "oid-shared",
        role: "admin",
      },
    ]);
    await verifiedAddress();

    const { recipients } = await workspaceEmailRecipients(TENANT_ID, "digest");
    const shared = recipients.filter((r) => r.email === SHARED);
    expect(shared).toHaveLength(1);
    expect(shared[0]?.kind).toBe("membership");
    expect(recipients).toHaveLength(2);
  });

  it("stays out of mail that has no switch of its own", async () => {
    await verifiedAddress();

    expect((await workspaceEmailRecipients(TENANT_ID)).recipients).toEqual([]);
  });

  it("goes away with its workspace", async () => {
    await verifiedAddress();

    await currentDb
      .delete(schema.tenants)
      .where(eq(schema.tenants.id, TENANT_ID));
    expect(await currentDb.query.notificationAddresses.findMany()).toHaveLength(
      0,
    );
  });

  it("is removed on request, pending link and all", async () => {
    await verifiedAddress();
    await requestVerification(TENANT_ID, "newer@contoso.test");
    const token = tokenOfLastEmail();

    await removeSharedAddress(TENANT_ID);
    expect(await row()).toBeNull();
    expect(await confirmAddress(TENANT_ID, token)).toBe(false);
  });
});

describe("sharedAddressSchema", () => {
  it("trims, lowercases and caps the address", () => {
    expect(sharedAddressSchema.parse("  IT-Licenses@Contoso.Test ")).toBe(
      SHARED,
    );
    expect(sharedAddressSchema.safeParse("not an address").success).toBe(false);
    expect(
      sharedAddressSchema.safeParse(`${"a".repeat(250)}@contoso.test`).success,
    ).toBe(false);
  });
});
