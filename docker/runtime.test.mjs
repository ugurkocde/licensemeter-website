import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { dueJobs } from "./scheduler.mjs";

test("UTC schedule matches the hosted sync, digest and report schedule", () => {
  assert.deepEqual(dueJobs(new Date("2026-09-16T03:00:30Z")), ["sync"]);
  assert.deepEqual(dueJobs(new Date("2026-09-14T06:00:00Z")), ["digest"]);
  assert.deepEqual(dueJobs(new Date("2026-10-01T07:00:00Z")), ["report"]);
  assert.deepEqual(dueJobs(new Date("2026-09-15T06:00:00Z")), []);
  assert.deepEqual(dueJobs(new Date("2026-09-15T05:00:00Z")), ["retention"]);
  assert.deepEqual(dueJobs(new Date("2026-10-02T07:00:00Z")), []);
  assert.deepEqual(dueJobs(new Date("2026-09-16T03:01:00Z")), []);
});

test("setup creates distinct secrets and never replaces an existing environment", async () => {
  const folder = await mkdtemp(join(tmpdir(), "licensemeter-setup-test-"));
  await mkdir(join(folder, "scripts"));
  await writeFile(
    join(folder, "scripts/setup-docker.mjs"),
    await readFile("scripts/setup-docker.mjs"),
  );
  await writeFile(
    join(folder, ".env.docker.example"),
    await readFile(".env.docker.example"),
  );
  const run = () =>
    spawnSync(process.execPath, [join(folder, "scripts/setup-docker.mjs")], {
      encoding: "utf8",
    });
  assert.equal(run().status, 0);
  const original = await readFile(join(folder, ".env.docker"), "utf8");
  const secrets = [...original.matchAll(/^[A-Z_]+=(\w{64})$/gm)].map(
    (m) => m[1],
  );
  assert.equal(secrets.length, 5);
  assert.equal(new Set(secrets).size, 5);
  assert.equal(run().status, 1);
  assert.equal(await readFile(join(folder, ".env.docker"), "utf8"), original);
});

test("startup rejects missing secrets and insecure remote origins before serving", () => {
  const run = (env) =>
    spawnSync(process.execPath, ["docker/entrypoint.mjs"], {
      env,
      encoding: "utf8",
    });
  assert.match(run({}).stderr, /AUTH_SECRET must contain/);
  const result = run({
    AUTH_SECRET: "a".repeat(32),
    DATA_ENCRYPTION_KEY: "b".repeat(32),
    CRON_SECRET: "c".repeat(32),
    DATABASE_URL: "postgres://test:test@db/test",
    APP_BASE_URL: "http://remote.example",
    DEMO_MODE: "true",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must use HTTPS/);
});
