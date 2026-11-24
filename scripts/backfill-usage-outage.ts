import { cp, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { and, asc, eq, gte, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { z } from "zod";

import type { Db } from "~/server/db";
import * as schema from "~/server/db/schema";
import {
  auditLog,
  findings,
  syncRuns,
  tenants,
  tenantUsers,
} from "~/server/db/schema";
import { latestActivity, WORKLOAD_KEYS } from "~/server/sync/join";
import { lockTenant } from "~/server/sync/lockTenant";
import type { FindingStatusChange } from "~/server/sync/runSync";
import type { SyncStep, WorkloadActivity } from "~/server/types";

const DEFAULT_SINCE = "2026-11-21";
const DRY_RUN_MESSAGE =
  "DRY RUN: no changes written. Re-run with --apply to write.";
const uuid = z.guid();
const date = z.iso.date();
const timestamp = z.iso.datetime({ offset: true });
const workload = z.object({
  exchange: date.nullable().optional(),
  oneDrive: date.nullable().optional(),
  sharePoint: date.nullable().optional(),
  teams: date.nullable().optional(),
  copilot: date.nullable().optional(),
});
const snapshotRow = z.object({
  tenant_id: uuid,
  graph_id: z.string(),
  workload_activity: workload.nullable(),
  last_activity: timestamp.nullable(),
  synced_at: timestamp,
});

class BackfillError extends Error {}

function databaseUrl(raw: string, name: string) {
  const url = URL.parse(raw);
  const fail = () => {
    throw new BackfillError(
      `${name} must name one PostgreSQL host and database, with optional sslmode.`,
    );
  };
  if (
    !url ||
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !url.hostname ||
    /[%,]/.test(url.hostname) ||
    url.hash
  )
    return fail();

  const mode = url.searchParams.get("sslmode");
  if (
    url.searchParams.size > Number(mode !== null) ||
    (mode !== null &&
      !["disable", "require", "verify-ca", "verify-full"].includes(mode))
  )
    return fail();

  let database: string;
  let username: string;
  let password: string;
  try {
    database = decodeURIComponent(url.pathname.slice(1));
    username = decodeURIComponent(url.username);
    password = decodeURIComponent(url.password);
  } catch {
    return fail();
  }
  if (
    !database ||
    url.pathname.slice(1).includes("/") ||
    [database, username, password].some((value) => value.includes("\0"))
  )
    return fail();

  // Pin localhost to loopback without consulting DNS.
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  const host = hostname === "localhost" ? "127.0.0.1" : hostname;
  const local = host === "127.0.0.1" || host === "[::1]";
  const port = Number(url.port || 5432);
  if (port === 0) return fail();
  return {
    hostname: url.hostname,
    host: host.replace(/^\[|\]$/g, ""),
    port,
    database,
    username,
    password,
    local,
    ssl:
      mode === "disable" || (local && mode === null)
        ? (false as const)
        : mode === "require"
          ? ("require" as const)
          : ("verify-full" as const),
  };
}

function openPostgres(config: ReturnType<typeof databaseUrl>) {
  const { host, port, database, username, password, ssl } = config;
  return postgres({
    // postgres.js accepts endpoint arrays at runtime. They keep IPv6 colons
    // intact instead of passing the address through its host:port splitter.
    host: [host] as unknown as string,
    port: [port] as unknown as number,
    database,
    username,
    password,
    ssl,
    max: 1,
    connect_timeout: 5,
    prepare: false,
    onnotice: () => undefined,
  });
}

export function backfillOptions(
  args: string[],
  env: Readonly<Record<string, string | undefined>>,
) {
  let values;
  try {
    ({ values } = parseArgs({
      args,
      options: {
        apply: { type: "boolean" },
        "i-have-a-backup": { type: "boolean" },
        "confirm-target-host": { type: "string" },
        "snapshot-file": { type: "string" },
        source: { type: "string" },
        since: { type: "string", default: DEFAULT_SINCE },
        tenant: { type: "string", multiple: true, default: [] },
        json: { type: "boolean" },
      },
    }));
  } catch {
    throw new BackfillError(
      "Invalid arguments. See docs/runbooks/usage-outage-backfill.md.",
    );
  }
  if (values.apply && !values["i-have-a-backup"]) {
    throw new BackfillError("--apply requires --i-have-a-backup.");
  }
  const target = env.DATABASE_URL
    ? databaseUrl(env.DATABASE_URL, "DATABASE_URL")
    : null;
  const snapshotDb = env.SNAPSHOT_DATABASE_URL
    ? databaseUrl(env.SNAPSHOT_DATABASE_URL, "SNAPSHOT_DATABASE_URL")
    : null;
  if (
    target &&
    target.host === snapshotDb?.host &&
    target.port === snapshotDb.port &&
    target.database === snapshotDb.database
  ) {
    throw new BackfillError(
      "DATABASE_URL and SNAPSHOT_DATABASE_URL must be separate databases.",
    );
  }
  if (
    target &&
    !target.local &&
    values["confirm-target-host"] !== target.hostname
  ) {
    throw new BackfillError(
      "A remote DATABASE_URL requires --confirm-target-host matching its hostname exactly.",
    );
  }
  if (
    !date.safeParse(values.since).success ||
    !values.tenant.every((id) => uuid.safeParse(id).success)
  ) {
    throw new BackfillError(
      "--since requires YYYY-MM-DD and --tenant requires a UUID.",
    );
  }
  if (values.source && values.source !== "findings") {
    throw new BackfillError("--source accepts only findings.");
  }
  const snapshotFile = values["snapshot-file"]
    ? resolve(values["snapshot-file"])
    : null;
  const source = snapshotDb
    ? "snapshot-database"
    : snapshotFile
      ? "snapshot-file"
      : values.source;
  if (!source) {
    throw new BackfillError(
      "Set SNAPSHOT_DATABASE_URL, pass --snapshot-file, or choose --source findings.",
    );
  }
  return {
    target,
    snapshotDb,
    snapshotFile,
    source,
    since: new Date(values.since),
    tenantIds: [...new Set(values.tenant.map((id) => id.toLowerCase()))],
    apply: !!values.apply,
    json: !!values.json,
  };
}

type Options = ReturnType<typeof backfillOptions>;
type SnapshotRow = z.infer<typeof snapshotRow>;
type Evidence = {
  tenantId: string;
  lastNonEmpty: Date;
  firstEmpty: Date;
  latestAt: Date;
  latestStep: SyncStep;
};

function emptyStep(step: SyncStep) {
  return step.count === 0 || step.status === "warning";
}

async function affectedTenants(
  tx: Db,
  options: Options,
  tenantIds = options.tenantIds,
): Promise<Evidence[]> {
  const runs = await tx
    .select({
      tenantId: syncRuns.tenantId,
      at: syncRuns.startedAt,
      steps: syncRuns.steps,
    })
    .from(syncRuns)
    .where(
      and(
        gte(
          syncRuns.startedAt,
          new Date(options.since.getTime() - 30 * 86_400_000),
        ),
        tenantIds.length ? inArray(syncRuns.tenantId, tenantIds) : undefined,
        sql`${syncRuns.status} <> 'running'`,
        sql`jsonb_path_exists(${syncRuns.steps}, '$[*] ? (@.step == "usageReports")')`,
      ),
    )
    .orderBy(asc(syncRuns.startedAt), asc(syncRuns.id));
  const evidence = new Map<
    string,
    {
      lastNonEmpty?: Date;
      firstEmpty?: Date;
      latestAt: Date;
      latestStep: SyncStep;
    }
  >();
  for (const { tenantId, at, steps } of runs) {
    const step = steps
      .slice()
      .reverse()
      .find((s) => s.step === "usageReports");
    if (!step) continue;
    const prior = evidence.get(tenantId);
    evidence.set(tenantId, {
      latestStep: step,
      latestAt: at,
      lastNonEmpty:
        at < options.since && (step.count ?? 0) > 0 ? at : prior?.lastNonEmpty,
      firstEmpty:
        prior?.firstEmpty ??
        (at >= options.since && emptyStep(step) ? at : undefined),
    });
  }
  return [...evidence]
    .flatMap(([tenantId, entry]) => {
      const { lastNonEmpty, firstEmpty } = entry;
      return lastNonEmpty && firstEmpty
        ? [{ ...entry, tenantId, lastNonEmpty, firstEmpty }]
        : [];
    })
    .sort((a, b) => a.tenantId.localeCompare(b.tenantId));
}

async function readSnapshot(options: Options, ids: string[]) {
  const byTenant = new Map<string, Map<string, SnapshotRow>>();
  if (ids.length === 0 || options.source === "findings") return byTenant;
  let rows: readonly unknown[];
  if (options.snapshotDb) {
    const client = openPostgres(options.snapshotDb);
    try {
      rows = await client.begin("read only", async (tx) => {
        // Fail instead of exporting an incomplete snapshot under RLS.
        await tx`set local row_security = off`;
        return tx`
          select tenant_id, graph_id, workload_activity,
            to_json(last_activity) as last_activity, to_json(synced_at) as synced_at
          from public.tenant_users where tenant_id in ${tx(ids)}
        `;
      });
    } finally {
      await client.end();
    }
  } else {
    try {
      const file = (await readFile(options.snapshotFile!, "utf8")).trim();
      rows = file.startsWith("[")
        ? (JSON.parse(file) as unknown[])
        : file
          ? file.split(/\r?\n/).map((line) => JSON.parse(line) as unknown)
          : [];
    } catch {
      throw new BackfillError(
        "Could not read the snapshot file as JSON or JSON lines.",
      );
    }
  }
  const selected = new Set(ids);
  for (const [index, row] of rows.entries()) {
    const parsed = snapshotRow.safeParse(row);
    if (!parsed.success)
      throw new BackfillError(
        `Invalid snapshot row ${index + 1}. Check the export columns and date format.`,
      );
    const tenantId = parsed.data.tenant_id.toLowerCase();
    if (
      !selected.has(tenantId) ||
      !uuid.safeParse(parsed.data.graph_id).success ||
      new Date(parsed.data.synced_at) >= options.since
    )
      continue;
    const users = byTenant.get(tenantId) ?? new Map<string, SnapshotRow>();
    const userId = parsed.data.graph_id;
    if (users.has(userId))
      throw new BackfillError("Snapshot has duplicate tenant/user keys.");
    users.set(userId, parsed.data);
    byTenant.set(tenantId, users);
  }
  return byTenant;
}

const inactivityRules = new Set(["inactive_90d", "never_active"]);
const dateValue = (value: Date | null) => value?.getTime() ?? null;
type UserRow = typeof tenantUsers.$inferSelect;
type FindingRow = typeof findings.$inferSelect;
type UserValues = Partial<Pick<UserRow, "workloadActivity" | "lastActivity">>;

function findingEvidence(rows: FindingRow[], since: Date) {
  const result = new Map<string, Date>();
  for (const row of rows) {
    const value = row.detail.lastActivity;
    if (
      !row.graphUserId ||
      !uuid.safeParse(row.graphUserId).success ||
      !inactivityRules.has(row.rule) ||
      row.lastSeenAt >= since ||
      !timestamp.safeParse(value).success ||
      typeof value !== "string"
    )
      continue;
    const lastActivity = new Date(value);
    const prior = result.get(row.graphUserId);
    if (lastActivity < since && (!prior || lastActivity > prior)) {
      result.set(row.graphUserId, lastActivity);
    }
  }
  return result;
}

async function repairTenant(
  tx: Db,
  options: Options,
  evidence: Evidence,
  snapshot: ReadonlyMap<string, SnapshotRow>,
  now: Date,
) {
  const { audit } = await import("~/server/audit");
  const { runAnalysis } = await import("~/server/sync/runSync");
  const { tenantId } = evidence;
  const tenant = await tx.query.tenants.findFirst({
    where: eq(tenants.id, tenantId),
    columns: { usageReportUnavailable: true },
  });
  if (!tenant)
    throw new BackfillError(
      "An affected tenant disappeared. Re-run detection.",
    );
  const users = await tx.query.tenantUsers.findMany({
    where: eq(tenantUsers.tenantId, tenantId),
    columns: {
      graphId: true,
      workloadActivity: true,
      lastActivity: true,
      lastInteractiveSignIn: true,
      lastNonInteractiveSignIn: true,
    },
    orderBy: asc(tenantUsers.graphId),
  });
  const tenantFindings = tx
    .select()
    .from(findings)
    .where(
      and(
        eq(findings.tenantId, tenantId),
        inArray(findings.rule, [
          "inactive_90d",
          "never_active",
          "copilot_unused",
        ]),
      ),
    )
    .orderBy(asc(findings.id));
  const storedFindings = await (options.apply
    ? tenantFindings.for("no key update")
    : tenantFindings);
  const fallback =
    options.source === "findings"
      ? findingEvidence(storedFindings, options.since)
      : null;
  const source = fallback ?? snapshot;
  const missing = new Set(source.keys());
  const restored = new Map<
    string,
    Pick<UserRow, "workloadActivity" | "lastActivity">
  >();
  const changes: { graphId: string; before: UserValues; after: UserValues }[] =
    [];
  const workloadCounts = {
    exchange: 0,
    oneDrive: 0,
    sharePoint: 0,
    teams: 0,
    copilot: 0,
  };
  const lastActivityChanged = new Set<string>();
  const copilotChanged = new Set<string>();

  for (const user of users) {
    const { graphId } = user;
    if (!missing.delete(graphId)) continue;
    const previous = snapshot.get(graphId)?.workload_activity;
    const merged: WorkloadActivity = {
      exchange: null,
      oneDrive: null,
      sharePoint: null,
      teams: null,
      copilot: null,
      ...user.workloadActivity,
    };
    let workloadChanged = false;
    for (const key of WORKLOAD_KEYS) {
      const old = merged[key] ?? null;
      const recovered = previous?.[key];
      // Workload values are ISO dates. Preserve the stored representation
      // for keys that have no new evidence.
      if (!recovered || (old && new Date(recovered) <= new Date(old))) continue;
      merged[key] = recovered;
      workloadChanged = true;
      workloadCounts[key]++;
      if (key === "copilot") copilotChanged.add(graphId);
    }
    const workloadActivity = workloadChanged ? merged : user.workloadActivity;
    const lastActivity = latestActivity(
      workloadActivity,
      user.lastActivity,
      user.lastInteractiveSignIn,
      user.lastNonInteractiveSignIn,
      fallback?.get(graphId) ?? null,
    );
    const activityChanged =
      dateValue(lastActivity) !== dateValue(user.lastActivity);
    if (activityChanged) lastActivityChanged.add(graphId);
    if (!workloadChanged && !activityChanged) continue;

    const before: UserValues = {};
    const after: UserValues = {};
    if (workloadChanged) {
      before.workloadActivity = user.workloadActivity;
      after.workloadActivity = workloadActivity;
    }
    if (activityChanged) {
      before.lastActivity = user.lastActivity;
      after.lastActivity = lastActivity;
    }
    changes.push({ graphId, before, after });
    restored.set(graphId, { workloadActivity, lastActivity });
  }

  const unavailable = emptyStep(evidence.latestStep)
    ? true
    : tenant.usageReportUnavailable;
  const flag =
    unavailable !== tenant.usageReportUnavailable
      ? { before: tenant.usageReportUnavailable, after: unavailable }
      : null;
  const findingChanges: FindingStatusChange[] = [];
  if (lastActivityChanged.size || copilotChanged.size) {
    const humanActions = await tx
      .select({
        action: auditLog.action,
        detail: auditLog.detail,
        createdAt: auditLog.createdAt,
      })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.tenantId, tenantId),
          inArray(auditLog.action, [
            "finding_status_changed",
            "finding_workflow_updated",
            "findings_bulk_updated",
          ]),
        ),
      );
    const edited = new Set(humanActions.map((row) => row.detail.findingId));
    const latestBulk = Math.max(
      -Infinity,
      ...humanActions
        .filter((row) => row.action === "findings_bulk_updated")
        .map((row) => row.createdAt.getTime()),
    );
    await runAnalysis(tenantId, {
      database: tx,
      now,
      users: restored,
      usageReportUnavailable: unavailable,
      reconcile: {
        preview: !options.apply,
        changes: findingChanges,
        includes: ({ graphUserId, rule }) =>
          graphUserId !== null &&
          (rule === "copilot_unused"
            ? copilotChanged.has(graphUserId)
            : inactivityRules.has(rule) &&
              lastActivityChanged.has(graphUserId)),
        protects: (f) =>
          f.status === "acknowledged" ||
          f.remediationStatus !== "unassigned" ||
          [
            f.assigneeMembershipId,
            f.dueDate,
            f.workflowNote,
            f.ticketUrl,
            f.remediationRequestedAt,
          ].some((value) => value !== null) ||
          edited.has(f.id) ||
          // The bulk audit records a count, not IDs. Any finding that
          // existed then could have been part of the user's selection.
          f.firstSeenAt.getTime() <= latestBulk,
      },
    });
  }
  const changedFindings = new Set(findingChanges.map((f) => f.id));
  const identity = ({
    id,
    rule,
    graphUserId,
  }: Pick<FindingRow, "id" | "rule" | "graphUserId">) => ({
    id,
    rule,
    graphUserId: uuid.safeParse(graphUserId).success ? graphUserId : null,
  });
  const findingReport = {
    reopen: findingChanges
      .filter((f) => f.before?.status === "resolved")
      .map(identity),
    resolve: findingChanges
      .filter((f) => f.after.status === "resolved")
      .map(identity),
    create: findingChanges.filter((f) => !f.before).map(identity),
    unchanged: storedFindings
      .filter((f) => !changedFindings.has(f.id))
      .map(identity),
  };
  const counts = {
    usersChanged: changes.length,
    workloadCounts,
    lastActivityChanged: lastActivityChanged.size,
    deletedUsersSkipped: missing.size,
    flagChanged: Number(!!flag),
    findingsReopened: findingReport.reopen.length,
    findingsResolved: findingReport.resolve.length,
    findingsCreated: findingReport.create.length,
    findingsUnchanged: findingReport.unchanged.length,
  };

  let auditId: string | undefined;
  if (options.apply && (changes.length || flag || findingChanges.length)) {
    for (const change of changes) {
      await tx
        .update(tenantUsers)
        .set(change.after)
        .where(
          and(
            eq(tenantUsers.tenantId, tenantId),
            eq(tenantUsers.graphId, change.graphId),
          ),
        );
    }
    if (flag) {
      await tx
        .update(tenants)
        .set({ usageReportUnavailable: flag.after })
        .where(eq(tenants.id, tenantId));
    }
    auditId = await audit(
      { tenantId, actorOid: "system backfill", transaction: tx },
      "usage_outage_backfilled",
      counts,
    );
  }
  return {
    tenantId,
    lastNonEmpty: evidence.lastNonEmpty,
    firstEmpty: evidence.firstEmpty,
    latestAt: evidence.latestAt,
    latestEmpty: emptyStep(evidence.latestStep),
    counts,
    findings: findingReport,
    ...(options.apply &&
      options.json &&
      auditId && {
        rollback: {
          users: changes,
          usageReportUnavailable: flag,
          findings: findingChanges,
          auditId,
        },
      }),
  };
}

export async function backfillUsageOutage(
  database: Db,
  options: Options,
  now = new Date(),
) {
  const reports: Awaited<ReturnType<typeof repairTenant>>[] = [];
  const skippedTenants: { tenantId: string; reason: string }[] = [];
  let failedTenant: string | undefined;
  const readPlan = async (tx: Db) => {
    // Maintenance needs complete tenant visibility. Fail if policies would
    // filter rows; this setting does not bypass RLS for restricted roles.
    await tx.execute(sql`set local row_security = off`);
    const result = await tx.execute<{ present: boolean }>(sql`
      select exists (select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'tenants'
        and column_name = 'usage_report_unavailable') as present
    `);
    const rows =
      "rows" in result ? (result.rows as { present: boolean }[]) : result;
    if (!rows[0]?.present) {
      throw new BackfillError(
        "Missing tenants.usage_report_unavailable. Run scripts/db-add-usage-report-unavailable.sql and deploy #176 first.",
      );
    }
    const detected = await affectedTenants(tx, options);
    const snapshot = await readSnapshot(
      options,
      detected.map((d) => d.tenantId),
    );
    if (!options.apply) {
      for (const evidence of detected) {
        reports.push(
          await repairTenant(
            tx,
            options,
            evidence,
            snapshot.get(evidence.tenantId) ?? new Map(),
            now,
          ),
        );
      }
    }
    return { detected, snapshot };
  };

  // Drizzle sets READ ONLY immediately after BEGIN, before the first query.
  // The preview computes finding transitions in memory, so it needs no writes.
  const { detected, snapshot } = await database.transaction(readPlan, {
    isolationLevel: "repeatable read",
    accessMode: "read only",
  });

  if (options.apply) {
    for (const { tenantId } of detected) {
      try {
        const result = await database.transaction(
          async (tx) => {
            await tx.execute(sql`set local row_security = off`);
            await tx.execute(sql`set local lock_timeout = '5s'`);
            if (!(await lockTenant(tx, tenantId, true)))
              return { reason: "tenant busy or removed" };

            const running = await tx.query.syncRuns.findFirst({
              where: and(
                eq(syncRuns.tenantId, tenantId),
                eq(syncRuns.status, "running"),
              ),
              columns: { id: true },
            });
            if (running) return { reason: "sync in progress" };

            // A sync may have finished after discovery. Use its current evidence
            // and read the rows under the same lock that covers the repair.
            const [evidence] = await affectedTenants(tx, options, [tenantId]);
            if (!evidence) return { reason: "outage evidence changed" };

            return {
              report: await repairTenant(
                tx,
                options,
                evidence,
                snapshot.get(tenantId) ?? new Map(),
                now,
              ),
            };
          },
          { isolationLevel: "read committed" },
        );
        if (result.report) reports.push(result.report);
        else skippedTenants.push({ tenantId, reason: result.reason });
      } catch {
        // Preserve the reports for any tenants already committed.
        failedTenant = tenantId;
        break;
      }
    }
  }

  return {
    mode: options.apply ? "apply" : "dry-run",
    source: options.source,
    partial: options.source === "findings",
    since: options.since,
    tenants: reports,
    skippedTenants,
    ...(failedTenant && { failedTenant }),
    totals: {
      tenants: reports.length,
      usersChanged: reports.reduce((sum, r) => sum + r.counts.usersChanged, 0),
      lastActivityChanged: reports.reduce(
        (sum, r) => sum + r.counts.lastActivityChanged,
        0,
      ),
      deletedUsersSkipped: reports.reduce(
        (sum, r) => sum + r.counts.deletedUsersSkipped,
        0,
      ),
      flagsChanged: reports.reduce((sum, r) => sum + r.counts.flagChanged, 0),
      findingsReopened: reports.reduce(
        (sum, r) => sum + r.counts.findingsReopened,
        0,
      ),
      findingsResolved: reports.reduce(
        (sum, r) => sum + r.counts.findingsResolved,
        0,
      ),
      findingsCreated: reports.reduce(
        (sum, r) => sum + r.counts.findingsCreated,
        0,
      ),
      findingsUnchanged: reports.reduce(
        (sum, r) => sum + r.counts.findingsUnchanged,
        0,
      ),
    },
    ...(!options.apply && { message: DRY_RUN_MESSAGE }),
  };
}

function formatReport(report: Awaited<ReturnType<typeof backfillUsageOutage>>) {
  const lines = [
    `${report.mode.toUpperCase()} | Source: ${report.source} | Since: ${report.since.toISOString().slice(0, 10)} UTC`,
  ];
  if (report.partial) {
    lines.push(
      "PARTIAL: findings can restore known last_activity only. No workload dates can be recovered, and users without pre-outage findings are outside this repair.",
    );
  }
  for (const tenant of report.tenants) {
    const c = tenant.counts;
    lines.push(
      "",
      `Tenant ${tenant.tenantId}`,
      `  Last non-empty: ${tenant.lastNonEmpty.toISOString()} | First empty: ${tenant.firstEmpty.toISOString()}`,
      `  Latest usageReports: ${tenant.latestAt.toISOString()} (${tenant.latestEmpty ? "empty" : "not empty"}) | Flag changes: ${c.flagChanged}`,
      `  Users restored: ${c.usersChanged} | last_activity changes: ${c.lastActivityChanged} | Deleted users skipped: ${c.deletedUsersSkipped}`,
      `  Workload dates restored: ${WORKLOAD_KEYS.map((key) => `${key}=${c.workloadCounts[key]}`).join(", ")}`,
    );
    for (const [action, entries] of Object.entries(tenant.findings)) {
      lines.push(`  Findings ${action}: ${entries.length}`);
      for (const f of entries)
        lines.push(`    ${f.id} | ${f.rule} | ${f.graphUserId ?? "-"}`);
    }
  }
  for (const { tenantId, reason } of report.skippedTenants) {
    lines.push(`Skipped tenant ${tenantId}: ${reason}.`);
  }
  if (report.failedTenant) {
    lines.push(
      `Apply stopped at tenant ${report.failedTenant}. Check the database logs and keep this report for any tenants already committed.`,
    );
  }
  const t = report.totals;
  lines.push(
    "",
    `Totals: ${t.tenants} tenants, ${t.usersChanged} users restored, ${t.lastActivityChanged} last_activity changes, ${t.deletedUsersSkipped} deleted users skipped, ${t.flagsChanged} flag changes, ${t.findingsReopened} findings reopened, ${t.findingsResolved} resolved, ${t.findingsCreated} created, ${t.findingsUnchanged} unchanged.`,
  );
  if (report.message) lines.push(report.message);
  return lines.join("\n");
}

async function main() {
  const raw = process.env.DATABASE_URL;
  if (raw) {
    try {
      const target = databaseUrl(raw, "DATABASE_URL");
      console.error(
        `Target host: ${target.hostname} | Database: ${JSON.stringify(target.database)}`,
      );
    } catch {
      console.error("Target host and database: invalid DATABASE_URL");
    }
  } else {
    console.error("Target host: local PGlite | Database: pglite");
  }
  const options = backfillOptions(process.argv.slice(2), process.env);
  const original = process.cwd();
  let scratch: string | undefined;
  try {
    if (!options.target) {
      delete process.env.DATABASE_URL;
      const data = join(original, ".pglite", "data");
      if (!(await stat(join(data, "PG_VERSION")).catch(() => null))) {
        throw new BackfillError("No existing PGlite store at .pglite/data.");
      }
      if (!options.apply) {
        // Opening or closing embedded Postgres can checkpoint its files.
        // Preview an offline copy so the original stays byte-identical.
        scratch = await mkdtemp(join(tmpdir(), "usage-backfill-"));
        await cp(data, join(scratch, ".pglite", "data"), { recursive: true });
        process.chdir(scratch);
      }
    }
    if (!process.env.NODE_ENV)
      Object.assign(process.env, { NODE_ENV: "development" });
    process.env.SKIP_ENV_VALIDATION = "true";
    const client = options.target && openPostgres(options.target);
    const local = client ? null : await import("~/server/db");
    try {
      const database = client ? drizzle(client, { schema }) : local!.db;
      const report = await backfillUsageOutage(database, options);
      console.log(
        options.json ? JSON.stringify(report, null, 2) : formatReport(report),
      );
      if (report.failedTenant) {
        if (options.json)
          console.error(`Apply stopped at tenant ${report.failedTenant}.`);
        process.exitCode = 1;
      }
    } finally {
      if (client) await client.end();
      else await local!.closeDatabase();
    }
  } finally {
    process.chdir(original);
    if (scratch) await rm(scratch, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error: unknown) => {
    // Driver errors may include URLs, SQL parameters or other private data.
    console.error(
      error instanceof BackfillError
        ? error.message
        : "Backfill failed. Check the database connection, schema, and maintenance-role permissions.",
    );
    process.exitCode = 1;
  });
}
