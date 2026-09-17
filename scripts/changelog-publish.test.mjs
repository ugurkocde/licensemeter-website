import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  API,
  loadEntries,
  publicUrl,
  publishAll,
  readConfig,
  validateEntry,
} from "./changelog-publish.mjs";

const entry = (overrides = {}) => ({
  title: "Product updates bell",
  summary: "A bell in the navigation shows recent updates.",
  type: "new",
  publishedOn: "2026-09-18",
  idempotencyKey: "licensemeter:2026-09-18-bell",
  ...overrides,
});

test("repository configuration matches the central API contract", async () => {
  const config = readConfig(await readFile(".ugurlabs/changelog.json", "utf8"));
  assert.deepEqual(config, {
    productId: "licensemeter",
    productName: "LicenseMeter",
    websiteUrl: "https://www.licensemeter.com/",
  });
  assert.throws(
    () =>
      readConfig(
        JSON.stringify({
          schemaVersion: 1,
          apiUrl: "https://evil.example/api",
        }),
      ),
    /central Ugurlabs API URL/,
  );
});

test("entries are validated against the API constraints", () => {
  assert.deepEqual(
    validateEntry(entry({ title: "  Bell  " }), "licensemeter"),
    {
      ...entry(),
      title: "Bell",
    },
  );
  assert.throws(
    () => validateEntry(entry({ type: "feature" }), "licensemeter"),
    /type must be/,
  );
  assert.throws(
    () => validateEntry(entry({ publishedOn: "2026-02-30" }), "licensemeter"),
    /real YYYY-MM-DD/,
  );
  assert.throws(
    () => validateEntry(entry({ publishedOn: "18.09.2026" }), "licensemeter"),
    /real YYYY-MM-DD/,
  );
  assert.throws(
    () =>
      validateEntry(entry({ idempotencyKey: "intuneget:x" }), "licensemeter"),
    /must start with/,
  );
  assert.throws(
    () => validateEntry(entry({ summary: "Too short" }), "licensemeter"),
    /summary/,
  );
  assert.throws(
    () => validateEntry(entry({ label: "extra" }), "licensemeter"),
    /Unknown field/,
  );
  assert.throws(
    () => validateEntry(entry({ sourceCommit: "xyz" }), "licensemeter"),
    /sourceCommit/,
  );
  assert.throws(
    () =>
      validateEntry(entry({ sourceUrl: "http://example.com" }), "licensemeter"),
    /HTTPS/,
  );
  assert.equal(
    validateEntry(entry({ sourceUrl: null }), "licensemeter").sourceUrl,
    undefined,
  );
  assert.equal(
    validateEntry(
      entry({ sourceUrl: "https://www.licensemeter.com/connectors" }),
      "licensemeter",
    ).sourceUrl,
    "https://www.licensemeter.com/connectors",
  );
});

test("public URLs reject private hosts, IPs, credentials, and secret queries", () => {
  assert.equal(
    publicUrl("https://www.licensemeter.com/"),
    "https://www.licensemeter.com/",
  );
  for (const bad of [
    "https://localhost/",
    "https://app.internal/",
    "https://10.0.0.1/",
    "https://user:pw@example.com/",
    "https://example.com/?token=abc",
    "ftp://example.com/",
  ]) {
    assert.throws(() => publicUrl(bad), undefined, bad);
  }
});

test("entry files load in name order and duplicate keys fail", async () => {
  const dir = await mkdtemp(join(tmpdir(), "licensemeter-changelog-"));
  await mkdir(join(dir, "entries"));
  await writeFile(
    join(dir, "entries/2026-09-18-b.json"),
    JSON.stringify(entry({ idempotencyKey: "licensemeter:b" })),
  );
  await writeFile(
    join(dir, "entries/2026-09-17-a.json"),
    JSON.stringify(entry({ idempotencyKey: "licensemeter:a" })),
  );
  await writeFile(join(dir, "entries/notes.md"), "ignored");
  const loaded = await loadEntries(join(dir, "entries"), "licensemeter");
  assert.deepEqual(
    loaded.map((e) => e.entry.idempotencyKey),
    ["licensemeter:a", "licensemeter:b"],
  );
  await writeFile(
    join(dir, "entries/2026-09-19-dup.json"),
    JSON.stringify(entry({ idempotencyKey: "licensemeter:a" })),
  );
  await assert.rejects(
    loadEntries(join(dir, "entries"), "licensemeter"),
    /already used by/,
  );
  assert.deepEqual(await loadEntries(join(dir, "missing"), "licensemeter"), []);
});

test("publishAll registers once, posts every entry, and reports replays", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({
      url,
      method: init.method,
      auth: init.headers.Authorization,
      body: JSON.parse(init.body),
    });
    if (init.method === "PUT") {
      return new Response(
        JSON.stringify({
          product: {
            id: "db-uuid",
            slug: "licensemeter",
            name: "LicenseMeter",
          },
        }),
        { status: 200 },
      );
    }
    const created = init.body.includes("licensemeter:new");
    return new Response(
      JSON.stringify({ id: created ? "ID-NEW" : "ID-OLD", created }),
      { status: created ? 201 : 200 },
    );
  };
  const logs = [];
  const results = await publishAll({
    config: {
      productId: "licensemeter",
      productName: "LicenseMeter",
      websiteUrl: "https://www.licensemeter.com/",
    },
    entries: [
      { file: "a.json", entry: entry({ idempotencyKey: "licensemeter:new" }) },
      { file: "b.json", entry: entry({ idempotencyKey: "licensemeter:old" }) },
    ],
    token: "secret-token",
    fetchImpl,
    log: (line) => logs.push(line),
  });
  assert.deepEqual(results, [
    { file: "a.json", id: "ID-NEW", created: true },
    { file: "b.json", id: "ID-OLD", created: false },
  ]);
  assert.deepEqual(
    calls.map((c) => [c.method, c.url]),
    [
      ["PUT", `${API}/licensemeter`],
      ["POST", `${API}/licensemeter`],
      ["POST", `${API}/licensemeter`],
    ],
  );
  assert.ok(calls.every((c) => c.auth === "Bearer secret-token"));
  assert.deepEqual(calls[0].body, {
    productName: "LicenseMeter",
    websiteUrl: "https://www.licensemeter.com/",
  });
  assert.match(
    logs[1],
    /^Published a\.json -> https:\/\/changelog\.ugurlabs\.com\/\?product=licensemeter#change-id-new$/,
  );
  assert.match(logs[2], /^Already published b\.json/);
  assert.ok(logs.every((line) => !line.includes("secret-token")));
});

test("publishAll surfaces API failures without leaking the token", async () => {
  const fetchImpl = async () =>
    new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  await assert.rejects(
    publishAll({
      config: {
        productId: "licensemeter",
        productName: "LicenseMeter",
        websiteUrl: "https://www.licensemeter.com/",
      },
      entries: [],
      token: "secret-token",
      fetchImpl,
      log: () => {},
    }),
    (error) =>
      /HTTP 401: Unauthorized/.test(error.message) &&
      !error.message.includes("secret-token"),
  );
});
