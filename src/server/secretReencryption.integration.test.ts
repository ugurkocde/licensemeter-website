import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import { beforeEach, describe, expect, it } from "vitest";

import { decryptWithKeys, deriveKey, encryptWithKey } from "./cryptoCore";
import type { Db } from "./db";
import * as schema from "./db/schema";
import {
  ReencryptionAborted,
  SECRET_COLUMNS,
  aadFor,
  reencryptSecrets,
} from "./secretReencryption";

/**
 * The transactional migration against a real Drizzle/PGlite database: counts,
 * the dry run, the commit, the rerun, and the rollback when a secret decrypts
 * with neither key.
 */

const OLD = deriveKey("auth-secret-old-auth-secret-old-auth-secret-old");
const NEW = deriveKey("data-key-new-data-key-new-data-key-new-data-key");
const OTHER = deriveKey("unrelated-key-unrelated-key-unrelated-key-xx");
const KEYS = { oldKey: OLD, newKey: NEW };
const [ms, adobe, saas] = SECRET_COLUMNS;

let cachedDdl: string[] | null = null;
const schemaDdl = async () =>
  (cachedDdl ??= await generateMigration(
    generateDrizzleJson({}),
    generateDrizzleJson(schema),
  ));

let database: Db;
const T1 = "11111111-1111-1111-1111-000000000001";
const T2 = "11111111-1111-1111-1111-000000000002";

const enc = (
  column: (typeof SECRET_COLUMNS)[number],
  tenantId: string,
  provider: string,
  key: Buffer,
) =>
  encryptWithKey(
    `plain-${provider}-${tenantId.slice(-1)}`,
    aadFor(column, { tenantId, provider, value: "" }),
    key,
  );

const seed = async (adobeKey: Buffer) => {
  await database.insert(schema.tenants).values([
    { id: T1, name: "Workspace 1" },
    { id: T2, name: "Workspace 2" },
  ]);
  await database.insert(schema.msConnections).values([
    {
      tenantId: T1,
      mode: "byo",
      tid: "tid-1",
      appClientId: "app-1",
      credType: "secret",
      secretEnc: enc(ms, T1, "microsoft", OLD),
    },
    { tenantId: T2, mode: "managed", tid: "tid-2" },
  ]);
  await database.insert(schema.adobeConnections).values({
    tenantId: T1,
    orgId: "org",
    clientId: "client",
    clientSecretEnc: enc(adobe, T1, "adobe", adobeKey),
  });
  await database.insert(schema.saasConnections).values([
    {
      tenantId: T1,
      provider: "zoom",
      orgRef: "acct",
      secretEnc: enc(saas, T1, "zoom", OLD),
    },
    {
      tenantId: T2,
      provider: "openai",
      orgRef: "org",
      secretEnc: enc(saas, T2, "openai", NEW),
    },
  ]);
};

const stored = async () => ({
  ms: (await database.select().from(schema.msConnections)).find(
    (r) => r.tenantId === T1,
  )!.secretEnc!,
  adobe: (await database.select().from(schema.adobeConnections))[0]!
    .clientSecretEnc,
  zoom: (await database.select().from(schema.saasConnections)).find(
    (r) => r.provider === "zoom",
  )!.secretEnc,
  openai: (await database.select().from(schema.saasConnections)).find(
    (r) => r.provider === "openai",
  )!.secretEnc,
});

beforeEach(async () => {
  const client = new PGlite();
  for (const stmt of await schemaDdl()) await client.exec(stmt);
  database = drizzle(client, { schema }) as unknown as Db;
});

describe("reencryptSecrets", () => {
  it("counts in a dry run and changes nothing", async () => {
    await seed(OLD);
    const before = await stored();
    const result = await reencryptSecrets(database, KEYS, { dryRun: true });
    expect(result).toEqual({
      dryRun: true,
      reencrypted: 0,
      columns: {
        "ms_connections.secret_enc": {
          total: 1,
          current: 0,
          migrate: 1,
          unreadable: 0,
        },
        "adobe_connections.client_secret_enc": {
          total: 1,
          current: 0,
          migrate: 1,
          unreadable: 0,
        },
        "saas_connections.secret_enc": {
          total: 2,
          current: 1,
          migrate: 1,
          unreadable: 0,
        },
      },
    });
    expect(await stored()).toEqual(before);
  });

  it("re-encrypts legacy secrets under the new key, then is a no-op", async () => {
    await seed(OLD);
    const before = await stored();
    const result = await reencryptSecrets(database, KEYS, { dryRun: false });
    expect(result.reencrypted).toBe(3);

    const after = await stored();
    expect(after.openai).toBe(before.openai);
    expect(
      decryptWithKeys(
        after.ms,
        aadFor(ms, { tenantId: T1, provider: "microsoft", value: "" }),
        [NEW],
      ),
    ).toBe("plain-microsoft-1");
    expect(
      decryptWithKeys(
        after.adobe,
        aadFor(adobe, { tenantId: T1, provider: "adobe", value: "" }),
        [NEW],
      ),
    ).toBe("plain-adobe-1");
    expect(
      decryptWithKeys(
        after.zoom,
        aadFor(saas, { tenantId: T1, provider: "zoom", value: "" }),
        [NEW],
      ),
    ).toBe("plain-zoom-1");

    const rerun = await reencryptSecrets(database, KEYS, { dryRun: false });
    expect(rerun.reencrypted).toBe(0);
    expect(await stored()).toEqual(after);
  });

  it("rolls back everything when a secret decrypts with neither key", async () => {
    await seed(OTHER);
    const before = await stored();
    await expect(
      reencryptSecrets(database, KEYS, { dryRun: false }),
    ).rejects.toBeInstanceOf(ReencryptionAborted);
    await expect(
      reencryptSecrets(database, KEYS, { dryRun: false }),
    ).rejects.toThrow(`adobe_connections tenant ${T1}`);
    expect(await stored()).toEqual(before);
  });
});
