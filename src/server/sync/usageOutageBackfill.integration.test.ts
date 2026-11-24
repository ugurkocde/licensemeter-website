import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  readdir,
  readFile,
  mkdir,
  mkdtemp,
  rm,
  writeFile,
} from "node:fs/promises";
import { resolve, join } from "node:path";
import { promisify } from "node:util";
import { PGlite } from "@electric-sql/pglite";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  backfillOptions,
  backfillUsageOutage,
} from "../../../scripts/backfill-usage-outage";
import type { Db } from "~/server/db";
import * as schema from "~/server/db/schema";

type Report = Awaited<ReturnType<typeof backfillUsageOutage>>;
const parseReport = (value: string) => JSON.parse(value) as Report;

const repo = process.cwd();
const exec = promisify(execFile);
const id = (n: number) =>
  `11111111-1111-4111-8111-${n.toString().padStart(12, "0")}`;
const t1 = id(1),
  t2 = id(2),
  t3 = id(3);
const e3 = "05e9a617-0261-4cee-bb44-138d3ef5d965";
const emptyWorkloads = {
  exchange: null,
  oneDrive: null,
  sharePoint: null,
  teams: null,
  copilot: null,
};

async function seed(directory: string, today: Date) {
  const shift = (days: number) => new Date(today.getTime() + days * 86_400_000);
  const recent = shift(-7).toISOString().slice(0, 10);
  const newer = shift(-1).toISOString().slice(0, 10);
  const old = shift(-120).toISOString().slice(0, 10);
  const since = shift(-3).toISOString().slice(0, 10);
  const ddl = await generateMigration(
    generateDrizzleJson({}),
    generateDrizzleJson(schema),
  );
  await mkdir(join(directory, ".pglite"), { recursive: true });
  const client = new PGlite(join(directory, ".pglite", "data"));
  const db = drizzle(client, { schema });
  try {
    for (const statement of ddl) await client.exec(statement);
    await db.insert(schema.tenants).values([
      { id: t1, name: "Example One", hasP1: true, activitySignal: "unknown" },
      {
        id: t2,
        name: "Example Two",
        hasP1: true,
        activitySignal: "full",
        usageReportUnavailable: false,
      },
      { id: t3, name: "Example Three", hasP1: true, activitySignal: "full" },
    ]);
    await db.insert(schema.syncRuns).values([
      ...[t1, t2, t3].map((tenantId) => ({
        tenantId,
        startedAt: shift(-4),
        status: "success" as const,
        steps: [
          { step: "usageReports" as const, status: "ok" as const, count: 10 },
        ],
      })),
      {
        tenantId: t1,
        startedAt: shift(-3),
        status: "success",
        steps: [{ step: "usageReports", status: "ok", count: 0 }],
      },
      {
        tenantId: t1,
        startedAt: shift(-2),
        status: "success",
        steps: [{ step: "usageReports", status: "warning" }],
      },
      {
        tenantId: t2,
        startedAt: shift(-3),
        status: "success",
        steps: [{ step: "usageReports", status: "warning" }],
      },
      {
        tenantId: t2,
        startedAt: shift(-1),
        status: "success",
        steps: [{ step: "usageReports", status: "ok", count: 10 }],
      },
      {
        tenantId: t3,
        startedAt: shift(-3),
        status: "success",
        steps: [{ step: "usageReports", status: "ok", count: 10 }],
      },
    ]);
    const tenantFor = (n: number) => (n === 121 ? t2 : n === 131 ? t3 : t1);
    const sourceWorkloads = (n: number) => ({
      ...emptyWorkloads,
      exchange: n === 102 || n === 108 ? old : recent,
      ...(n === 101 && {
        oneDrive: recent,
        sharePoint: recent,
        teams: recent,
        copilot: recent,
      }),
    });
    await db.insert(schema.tenantUsers).values(
      [101, 102, 103, 104, 105, 106, 107, 108, 121, 131].map((n) => ({
        tenantId: tenantFor(n),
        graphId: id(n),
        upn: `user-${n}@example.test`,
        displayName: `Example User ${n}`,
        createdDateTime: shift(-365),
        licenses: [
          {
            skuId: e3,
            assignedByGroup: null,
            disabledPlans: [],
            state: "Active",
          },
        ],
        syncedAt: shift(-3), // Mirrors the outage-era overwrite.
        lastInteractiveSignIn: n === 102 || n === 108 ? null : shift(-125),
        lastActivity:
          n === 102 || n === 108
            ? null
            : n === 104
              ? new Date(newer)
              : shift(-125),
        workloadActivity:
          n === 104 ? { ...emptyWorkloads, exchange: newer } : emptyWorkloads,
      })),
    );
    const finding = (
      n: number,
      user: number,
      rule: "inactive_90d" | "never_active",
      status: "open" | "acknowledged" | "resolved",
      extras: Partial<typeof schema.findings.$inferInsert> = {},
    ): typeof schema.findings.$inferInsert => ({
      id: id(n),
      tenantId: tenantFor(user),
      graphUserId: id(user),
      rule,
      status,
      title: "Example finding",
      dedupeKey: `${rule}|${id(user)}|-`,
      firstSeenAt: shift(-20),
      lastSeenAt: shift(-2),
      resolvedAt: status === "resolved" ? shift(-3) : null,
      ...extras,
    });
    await db.insert(schema.findings).values([
      finding(201, 101, "inactive_90d", "open"),
      finding(202, 102, "inactive_90d", "resolved", {
        lastSeenAt: shift(-4),
        detail: {
          lastActivity: new Date(old).toISOString(),
          inactiveDays: 120,
        },
      }),
      finding(203, 102, "never_active", "open"),
      finding(204, 103, "inactive_90d", "acknowledged"),
      finding(205, 105, "inactive_90d", "open", {
        workflowNote: "Example operator note",
      }),
      finding(206, 106, "inactive_90d", "open"),
      finding(207, 107, "inactive_90d", "open"),
      finding(221, 121, "inactive_90d", "open"),
      finding(231, 131, "inactive_90d", "open"),
    ]);
    await db.insert(schema.auditLog).values({
      tenantId: t1,
      actorOid: "example operator",
      action: "finding_status_changed",
      detail: { findingId: id(206), status: "open" },
    });
    const snapshot = [
      101, 102, 103, 104, 105, 106, 107, 108, 109, 121, 131,
    ].map((n) => ({
      tenant_id: tenantFor(n),
      graph_id: id(n),
      workload_activity: sourceWorkloads(n),
      last_activity: new Date(sourceWorkloads(n).exchange).toISOString(),
      synced_at: shift(n === 107 ? -3 : -4).toISOString(),
    }));
    await writeFile(join(directory, "snapshot.json"), JSON.stringify(snapshot));
    await writeFile(
      join(directory, "snapshot.jsonl"),
      snapshot.map((row) => JSON.stringify(row)).join("\n"),
    );
    return { since, recent, newer, old };
  } finally {
    await client.close();
  }
}

async function fingerprint(directory: string) {
  const hash = createHash("sha256");
  const walk = async (relative: string) => {
    const entries = await readdir(join(directory, relative), {
      withFileTypes: true,
    });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(relative, entry.name);
      hash.update(path);
      if (entry.isDirectory()) await walk(path);
      else hash.update(await readFile(join(directory, path)));
    }
  };
  await walk(".pglite");
  return hash.digest("hex");
}

function cli(
  directory: string,
  args: string[],
  env: Record<string, string> = {},
) {
  return exec(
    process.execPath,
    [
      "--import",
      resolve(repo, "node_modules/tsx/dist/loader.mjs"),
      resolve(repo, "scripts/backfill-usage-outage.ts"),
      ...args,
    ],
    {
      cwd: directory,
      env: {
        ...process.env,
        TSX_TSCONFIG_PATH: resolve(repo, "tsconfig.json"),
        DATABASE_URL: "",
        SNAPSHOT_DATABASE_URL: "",
        ...env,
      },
    },
  );
}

describe("usage outage backfill CLI on local PGlite", () => {
  let directory: string;
  let dates: Awaited<ReturnType<typeof seed>>;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  beforeAll(async () => {
    await mkdir(join(repo, "output"), { recursive: true });
    directory = await mkdtemp(join(repo, "output", "usage-backfill-test-"));
    dates = await seed(directory, today);
  });

  afterAll(async () => {
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  it("previews byte-for-byte, repairs findings and activity, and applies idempotently", async () => {
    const args = [
      "--since",
      dates.since,
      "--snapshot-file",
      "snapshot.jsonl",
      "--json",
    ];
    const before = await fingerprint(directory);
    const dry = await cli(directory, args);
    expect(dry.stderr).toContain("Target host: local PGlite");
    expect(dry.stdout).not.toContain("example.test");
    const preview = parseReport(dry.stdout);
    expect(await fingerprint(directory)).toBe(before);
    expect(preview.totals).toMatchObject({
      tenants: 2,
      findingsReopened: 1,
      findingsResolved: 3,
      findingsCreated: 1,
      deletedUsersSkipped: 1,
      flagsChanged: 1,
    });
    expect(preview.tenants[0]).toMatchObject({
      tenantId: t1,
      counts: {
        workloadCounts: {
          exchange: 6,
          oneDrive: 1,
          sharePoint: 1,
          teams: 1,
          copilot: 1,
        },
      },
      findings: {
        reopen: [{ id: id(202), graphUserId: id(102), rule: "inactive_90d" }],
      },
    });
    expect(preview.tenants[1]).toMatchObject({
      tenantId: t2,
      latestEmpty: false,
    });
    const apply = await cli(directory, [
      ...args,
      "--apply",
      "--i-have-a-backup",
    ]);
    const written = parseReport(apply.stdout);
    expect(written.totals).toEqual(preview.totals);
    expect(written.tenants[0]?.rollback).toMatchObject({
      users: expect.arrayContaining([
        {
          graphId: id(101),
          before: {
            lastActivity: expect.any(String) as unknown,
            workloadActivity: emptyWorkloads,
          },
          after: {
            lastActivity: expect.any(String) as unknown,
            workloadActivity: expect.objectContaining({
              exchange: dates.recent,
            }) as unknown,
          },
        },
      ]) as unknown,
      findings: expect.arrayContaining([
        expect.objectContaining({
          id: id(202),
          before: {
            status: "resolved",
            resolvedAt: expect.any(String) as unknown,
          },
          after: { status: "open", resolvedAt: null },
        }),
      ]) as unknown,
      usageReportUnavailable: { before: null, after: true },
      auditId: expect.any(String) as unknown,
    });
    expect(apply.stdout).not.toContain("example.test");
    const second = await cli(directory, [
      ...args,
      "--apply",
      "--i-have-a-backup",
    ]);
    expect(parseReport(second.stdout).totals).toMatchObject({
      usersChanged: 0,
      lastActivityChanged: 0,
      flagsChanged: 0,
      findingsReopened: 0,
      findingsResolved: 0,
      findingsCreated: 0,
    });
    const client = new PGlite(join(directory, ".pglite", "data"));
    try {
      const db = drizzle(client, { schema });
      const users = new Map(
        (await db.select().from(schema.tenantUsers)).map((u) => [u.graphId, u]),
      );
      expect(users.get(id(101))?.workloadActivity?.exchange).toBe(dates.recent);
      expect(users.get(id(104))?.workloadActivity?.exchange).toBe(dates.newer);
      expect(users.get(id(107))?.workloadActivity).toEqual(emptyWorkloads);
      expect(users.get(id(109))).toBeUndefined();
      expect(users.get(id(131))?.workloadActivity).toEqual(emptyWorkloads);
      const statuses = new Map(
        (await db.select().from(schema.findings)).map((f) => [f.id, f.status]),
      );
      expect(
        [201, 202, 203, 204, 205, 206, 207, 221, 231].map((n) =>
          statuses.get(id(n)),
        ),
      ).toEqual([
        "resolved",
        "open",
        "resolved",
        "acknowledged",
        "open",
        "open",
        "open",
        "resolved",
        "open",
      ]);
      expect(
        (
          await db
            .select()
            .from(schema.auditLog)
            .where(eq(schema.auditLog.actorOid, "system backfill"))
        ).length,
      ).toBe(2);
    } finally {
      await client.close();
    }
  }, 30_000);

  it("falls back only to pre-outage finding activity and supports tenant restrictions", async () => {
    await seed(join(directory, "fallback"), today);
    const run = await cli(join(directory, "fallback"), [
      "--since",
      dates.since,
      "--source",
      "findings",
      "--tenant",
      t1,
      "--apply",
      "--i-have-a-backup",
      "--json",
    ]);
    const result = parseReport(run.stdout);
    expect(result).toMatchObject({
      partial: true,
      totals: {
        tenants: 1,
        usersChanged: 1,
        lastActivityChanged: 1,
        findingsReopened: 1,
      },
    });
    expect(result.tenants[0]?.rollback?.users).toEqual([
      {
        graphId: id(102),
        before: { lastActivity: null },
        after: { lastActivity: new Date(dates.old).toISOString() },
      },
    ]);
    expect(result.tenants[0]?.findings.unchanged).toContainEqual({
      id: id(201),
      rule: "inactive_90d",
      graphUserId: id(101),
    });
  }, 20_000);

  it("refuses remote targets without an exact host confirmation and backup for apply", async () => {
    const hostname = "db.example.supabase.co";
    const env = {
      DATABASE_URL: `postgresql://postgres:fake-secret@${hostname}/usage`,
    };
    const args = ["--snapshot-file", "snapshot.jsonl"];
    const refusal = {
      stderr: `Target host: ${hostname} | Database: "usage"\nA remote DATABASE_URL requires --confirm-target-host matching its hostname exactly.\n`,
    };
    await expect(cli(directory, args, env)).rejects.toMatchObject(refusal);
    await expect(
      cli(
        directory,
        [...args, "--confirm-target-host", hostname.toUpperCase()],
        env,
      ),
    ).rejects.toMatchObject(refusal);
    await expect(
      cli(
        directory,
        [...args, "--confirm-target-host", hostname, "--apply"],
        env,
      ),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining(
        "--apply requires --i-have-a-backup",
      ) as unknown,
    });

    // Parse positive remote cases without opening a connection.
    const confirmed = ["--confirm-target-host", hostname];
    const snapshot = {
      ...env,
      SNAPSHOT_DATABASE_URL: "postgresql://db.restore.example/usage",
    };
    expect(backfillOptions(confirmed, snapshot)).toMatchObject({
      apply: false,
      source: "snapshot-database",
      target: { host: hostname, database: "usage", local: false },
      snapshotDb: { host: "db.restore.example", database: "usage" },
    });
    expect(
      backfillOptions([...confirmed, "--apply", "--i-have-a-backup"], snapshot)
        .apply,
    ).toBe(true);
  });

  it.each([
    [
      "postgres://example:fake-secret@localhost/usage",
      "postgresql://other@127.0.0.1:5432/%75sage?sslmode=disable",
    ],
    [
      "postgres://postgres@db.example.supabase.co/usage",
      "postgresql://other@DB.Example.Supabase.CO.:05432/usage?sslmode=require",
    ],
  ])(
    "refuses the same database with different URL spellings",
    async (target, snapshot) => {
      await expect(
        cli(directory, [], {
          DATABASE_URL: target,
          SNAPSHOT_DATABASE_URL: snapshot,
        }),
      ).rejects.toMatchObject({
        stderr: expect.stringContaining(
          "must be separate databases",
        ) as unknown,
      });
    },
  );

  it("enforces a read-only dry run on the database session", async () => {
    const rehearsal = join(directory, "readonly");
    await seed(rehearsal, today);
    const client = new PGlite(join(rehearsal, ".pglite", "data"));
    try {
      const database = drizzle(client, { schema }) as unknown as Db;
      // Inject a write at the start of the real transaction callback, after
      // Drizzle has applied the transaction settings chosen by the backfill.
      const transaction = database.transaction.bind(database);
      database.transaction = (run, config) =>
        transaction(async (tx) => {
          await tx.update(schema.tenants).set({ usageReportUnavailable: true });
          return run(tx);
        }, config);
      await expect(
        backfillUsageOutage(
          database,
          backfillOptions(["--source", "findings"], {}),
        ),
      ).rejects.toMatchObject({ cause: { code: "25006" } });
    } finally {
      await client.close();
    }
  }, 20_000);

  it("skips a tenant with a running sync and still repairs another", async () => {
    const rehearsal = join(directory, "running");
    await seed(rehearsal, today);
    const store = join(rehearsal, ".pglite", "data");
    const client = new PGlite(store);
    try {
      await drizzle(client)
        .insert(schema.syncRuns)
        .values({ tenantId: t1, status: "running" });
    } finally {
      await client.close();
    }
    const run = await cli(rehearsal, [
      "--since",
      dates.since,
      "--snapshot-file",
      "snapshot.jsonl",
      "--apply",
      "--i-have-a-backup",
      "--json",
    ]);
    const report = parseReport(run.stdout);
    expect(report.skippedTenants).toEqual([
      { tenantId: t1, reason: "sync in progress" },
    ]);
    expect(report.tenants.map(({ tenantId }) => tenantId)).toEqual([t2]);

    const repaired = new PGlite(store);
    try {
      const db = drizzle(repaired, { schema });
      const tenant = await db.query.tenants.findFirst({
        where: eq(schema.tenants.id, t1),
      });
      const user = await db.query.tenantUsers.findFirst({
        where: eq(schema.tenantUsers.graphId, id(101)),
      });
      expect(tenant?.usageReportUnavailable).toBeNull();
      expect(user?.workloadActivity).toEqual(emptyWorkloads);
      const audits = await db
        .select()
        .from(schema.auditLog)
        .where(eq(schema.auditLog.actorOid, "system backfill"));
      expect(audits.map(({ tenantId }) => tenantId)).toEqual([t2]);
    } finally {
      await repaired.close();
    }
  }, 20_000);

  it("rolls back a failed tenant and reports any earlier committed repair", async () => {
    const rehearsal = join(directory, "partial");
    await seed(rehearsal, today);
    const store = join(rehearsal, ".pglite", "data");
    const client = new PGlite(store);
    try {
      await client.exec(`alter table audit_log add constraint simulated_failure
        check (tenant_id <> '${t2}' or action <> 'usage_outage_backfilled')`);
    } finally {
      await client.close();
    }
    const run = await cli(rehearsal, [
      "--since",
      dates.since,
      "--snapshot-file",
      "snapshot.jsonl",
      "--apply",
      "--i-have-a-backup",
      "--json",
    ]).then(
      () => {
        throw new Error("Expected a failed apply");
      },
      (error: { code: number; stdout: string }) => error,
    );
    expect(run.code).toBe(1);
    const report = parseReport(run.stdout);
    expect(report.failedTenant).toBe(t2);
    expect(report.tenants.map(({ tenantId }) => tenantId)).toEqual([t1]);
    expect(report.tenants[0]?.rollback).toBeDefined();

    const repaired = new PGlite(store);
    try {
      const db = drizzle(repaired, { schema });
      const user = await db.query.tenantUsers.findFirst({
        where: eq(schema.tenantUsers.graphId, id(121)),
      });
      const finding = await db.query.findings.findFirst({
        where: eq(schema.findings.id, id(221)),
      });
      expect(user?.workloadActivity).toEqual(emptyWorkloads);
      expect(finding?.status).toBe("open");
    } finally {
      await repaired.close();
    }
  }, 20_000);

  it("reports the required migration when the column is absent", async () => {
    const missing = join(directory, "missing");
    await seed(missing, today);
    const client = new PGlite(join(missing, ".pglite", "data"));
    try {
      await drizzle(client).execute(
        sql`alter table tenants drop column usage_report_unavailable`,
      );
    } finally {
      await client.close();
    }
    await expect(
      cli(missing, ["--snapshot-file", "snapshot.json"]),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining(
        "Run scripts/db-add-usage-report-unavailable.sql and deploy #176 first.",
      ) as unknown,
    });
  }, 20_000);
});
