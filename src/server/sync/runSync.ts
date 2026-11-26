import { randomUUID } from "node:crypto";
import { and, eq, gte, inArray, lt, notInArray, sql } from "drizzle-orm";

import { db, type Db } from "~/server/db";
import {
  PSEUDONYMISED_KEY_PREFIX,
  pseudonymisedDedupeKey,
} from "~/server/retention";
import { OpsSafeError, opsErrorText } from "~/server/opsError";
import {
  adobeConnections,
  adobeUsers as adobeUsersTable,
  aiSpendDaily,
  findings,
  msConnections,
  priceBook,
  saasConnections,
  saasSeats as saasSeatsTable,
  snapshots,
  syncRuns,
  tenantSkus,
  tenants,
  tenantUsers,
} from "~/server/db/schema";
import { DemoAdobeClient, UmapiClient } from "~/server/adobe/client";
import { adobePriceKey, analyzeAdobeWaste } from "~/server/adobe/analyze";
import { analyzeSaasWaste, saasPriceKey } from "~/server/saas/analyze";
import {
  buildSaasClient,
  DEMO_SAAS_PRICES,
  demoSaasClient,
  IMPORT_PROVIDERS,
  SAAS_PROVIDERS,
  type AiSpendClient,
} from "~/server/saas/registry";
import { decryptSecret, secretAad } from "~/server/crypto";
import type { AdobeUser, SaasProvider, SaasSeat } from "~/server/types";
import { DemoGraphClient } from "~/server/graph/demoGraph";
import { msGraphClientForTenant } from "~/server/graph/msConnection";
import {
  cleanPartNumber,
  skuDefaultPriceCents,
  skuDisplayName,
} from "~/server/graph/skuCatalog";
import {
  GraphHttpError,
  isConcealedUpn,
  PremiumLicenseRequiredError,
  type ActiveUserDetailReport,
  type CopilotUsageRow,
  type GraphClient,
  type GraphSubscribedSku,
  type GraphUser,
  type UsageReportRow,
} from "~/server/graph/types";
import { emailEnabled } from "~/server/email";
import { deliverOnce } from "~/server/emailDelivery";
import { leakAlertMessage } from "~/server/leakAlertMessage";
import { pickLeakFindings } from "~/server/leakAlerts";
import { isAppAuthError } from "~/lib/msAuthError";
import { notifyOps } from "~/server/ops";
import { workspaceAdminEmails } from "~/server/workspaceEmail";
import { aiSpendSinceDay } from "~/server/sync/aiSpendWindow";
import { optionalStepDeadline } from "~/server/sync/deadline";
import { errText } from "~/server/sync/errText";
import { createStepLog, persistRunSteps } from "~/server/sync/stepProgress";
import { textSet } from "~/server/sync/textSet";
import {
  lockTenantForWorkspaceUpdate,
  WorkspaceUpdateInProgressError,
} from "~/server/sync/lockTenant";
import { mergeAdobeUsers, mergeSaasSeats } from "~/server/sync/mergeByEmail";
import {
  subscriptionTermsBySku,
  type SkuTerms,
} from "~/server/sync/subscriptionTerms";
import { connectorSeatExclusion } from "~/server/sync/connectorExclusions";
import { directoryIdentitiesOf, joinSignals } from "~/server/sync/join";
import type {
  ActivitySignal,
  SyncRunStatus,
  SyncStep,
  WasteRuleId,
} from "~/server/types";
import {
  analyzeWaste,
  assignedSeatsOf,
  monthlyBilledSpendOf,
  isShelfwareExempt,
  paidSeatsOf,
  purchasedSeatsOf,
  type WasteFinding,
  type WasteInput,
} from "~/server/waste/engine";

const chunk = <T>(arr: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

/**
 * Daily snapshot breakdown of purchased and assigned seats for the same SKUs
 * included in the totals.
 */
const bySkuOf = (
  skus: readonly {
    skuId: string;
    skuPartNumber: string;
    prepaidEnabled: number;
    consumedUnits: number;
    trialUnits?: number;
  }[],
): Record<string, { purchased: number; assigned: number }> =>
  Object.fromEntries(
    skus
      .filter((s) => !isShelfwareExempt(s.skuPartNumber, s.prepaidEnabled))
      .map((s) => [
        s.skuId,
        { purchased: paidSeatsOf(s), assigned: s.consumedUnits },
      ]),
  );

const emptyUsageMessage = (report: ActiveUserDetailReport): string => {
  const reason = !report.hasHeader
    ? "no CSV header"
    : report.dataRowCount === 0
      ? "header only"
      : report.rows.length === 0
        ? "no user rows"
        : "no rows matched a licensed directory user";
  const details = [reason];
  if (report.reportRefreshDate)
    details.push(`report refresh date ${report.reportRefreshDate}`);
  if (report.bodyBytes !== undefined) details.push(`${report.bodyBytes} bytes`);
  return `Microsoft returned an empty usage report (${details.join(", ")})`;
};

const INACTIVITY_RULES: WasteRuleId[] = ["inactive_90d", "never_active"];
const USAGE_REPORT_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;

const analyzeWasteWithCoverage = async (
  tenantId: string,
  input: WasteInput,
  database = db,
) => {
  if (input.activitySignal !== "unknown") return analyzeWaste(input);
  const previous = await database.query.findings.findMany({
    where: and(
      eq(findings.tenantId, tenantId),
      inArray(findings.rule, INACTIVITY_RULES),
      inArray(findings.status, ["open", "acknowledged"]),
    ),
  });
  const previousInactivity = new Map(previous.map((f) => [f.dedupeKey, f]));
  const current = analyzeWaste({ ...input, previousInactivity });
  // An empty directory response leaves the stored directory in place.
  return input.users.length === 0
    ? current.concat(previous.filter((f) => f.graphUserId !== null))
    : current;
};

/** Milliseconds since `start`, recorded on every step to diagnose slow syncs. */
const since = (start: number): number => Date.now() - start;

/** Steps that need a Graph credential; skipped when Microsoft is not connected. */
const MICROSOFT_STEPS = [
  "subscribedSkus",
  "subscriptions",
  "reportSettings",
  "users",
  "usageReports",
  "copilotUsage",
] as const satisfies readonly SyncStep["step"][];

export type SyncResult =
  | {
      runId: string;
      status: SyncRunStatus;
      steps: SyncStep[];
    }
  | { runId: null; status: "running"; steps: [] };

/**
 * Pull daily cost rows for an AI connector and upsert them. The first sync
 * backfills as far as the provider exposes (OpenAI 180 days, Anthropic ~90);
 * later syncs re-pull from seven days before the newest stored day so
 * late-settling costs heal (window sizing lives in aiSpendWindow.ts). Failures
 * become a warning step and never disturb the member analysis already
 * collected for the provider.
 */
const syncAiSpend = async (
  tenantId: string,
  provider: "openai" | "anthropic",
  client: AiSpendClient,
  now: Date,
  record: (step: SyncStep) => void,
  deadline?: number,
): Promise<void> => {
  const step = `${provider}Spend` as const;
  const started = Date.now();
  try {
    const ensureWithinDeadline = (): void => {
      if (deadline !== undefined && Date.now() >= deadline) {
        throw new Error("Sync deadline reached");
      }
    };
    ensureWithinDeadline();
    const [latest] = await db
      .select({ day: sql<string | null>`max(${aiSpendDaily.day})` })
      .from(aiSpendDaily)
      .where(
        and(
          eq(aiSpendDaily.tenantId, tenantId),
          eq(aiSpendDaily.provider, provider),
        ),
      );
    const sinceDay = aiSpendSinceDay(latest?.day ?? null, provider, now);
    ensureWithinDeadline();
    const rows = await client.getSpend(sinceDay, deadline);
    for (const batch of chunk(rows, 250)) {
      ensureWithinDeadline();
      await db
        .insert(aiSpendDaily)
        .values(
          batch.map((r) => ({
            tenantId,
            provider,
            day: r.day,
            category: r.category,
            amountCents: r.amountCents,
            syncedAt: now,
          })),
        )
        .onConflictDoUpdate({
          target: [
            aiSpendDaily.tenantId,
            aiSpendDaily.provider,
            aiSpendDaily.day,
            aiSpendDaily.category,
          ],
          set: {
            amountCents: sql`excluded.amount_cents`,
            syncedAt: sql`excluded.synced_at`,
          },
        });
    }
    record({
      step,
      status: "ok",
      count: rows.length,
      durationMs: since(started),
    });
  } catch (err) {
    record({
      step,
      status: "warning",
      message: errText(err),
      durationMs: since(started),
    });
  }
};

/**
 * Full sync for one tenant: pull Graph data, persist the snapshot, run the
 * waste analysis, diff findings, and record a per-step run log. Non-critical
 * steps degrade to warnings; the sync continues with what it has.
 *
 * An injected client overrides the default selection: the delegated instant
 * scan passes a DelegatedGraphClient bound to the admin's one-shot token.
 */
export const runSync = async (
  tenantId: string,
  {
    client: clientOverride,
    deadline,
  }: { client?: GraphClient; deadline?: number } = {},
): Promise<SyncResult> => {
  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, tenantId),
  });
  if (!tenant) throw new Error(`Unknown tenant ${tenantId}`);

  /** True once the request budget is spent: optional sources are skipped. */
  const outOfTime = (): boolean =>
    deadline !== undefined && Date.now() >= deadline;

  // A workspace that connected Adobe or SaaS tools but never Microsoft has no
  // Graph credential: the Microsoft steps are recorded as skipped and the run
  // continues with the connector steps and the analysis. Same condition as
  // resolveMsCredential's "no Microsoft tenant connected" rejection.
  const hasMicrosoft =
    Boolean(clientOverride) ||
    tenant.isDemo ||
    tenant.tid !== null ||
    (await db.query.msConnections.findFirst({
      where: eq(msConnections.tenantId, tenantId),
    })) !== undefined;
  const client: GraphClient | null = hasMicrosoft
    ? (clientOverride ??
      (tenant.isDemo
        ? new DemoGraphClient()
        : await msGraphClientForTenant(tenant, deadline)))
    : null;

  // Fail runs stuck in "running" (crashed process) so the lock cannot
  // deadlock. The threshold must STRICTLY exceed the worst-case wall-clock of a
  // healthy run, or a slow-but-live sync gets force-failed while still writing,
  // letting a second run insert and the two writers prune each other's rows.
  // Worst case stays well under 10 min: the route deadline caps the whole pull
  // (every retry, throttle sleep and Graph request clamps to it), and the local
  // analysis and write after the pull is bounded by the data size. 20 min leaves
  // generous headroom above that ceiling while still clearing a truly dead row
  // before the next nightly cron, and keeps the instant-scan poller from showing
  // "syncing" indefinitely after a hard kill.
  const STALE_RUN_MS = 20 * 60 * 1000;
  const started = await db
    .transaction(async (tx) => {
      // A backfill holds this lock until all repairs for this tenant commit.
      await lockTenantForWorkspaceUpdate(tx, tenantId);
      await tx
        .update(syncRuns)
        .set({ status: "failed", error: "stale run", finishedAt: new Date() })
        .where(
          and(
            eq(syncRuns.tenantId, tenantId),
            eq(syncRuns.status, "running"),
            lt(syncRuns.startedAt, new Date(Date.now() - STALE_RUN_MS)),
          ),
        );

      // The partial unique index holds the guard for the rest of the sync.
      const [run] = await tx
        .insert(syncRuns)
        .values({ tenantId, status: "running" })
        .onConflictDoNothing({
          target: syncRuns.tenantId,
          where: sql`${syncRuns.status} = 'running'`,
        })
        .returning({ id: syncRuns.id });
      if (run) return { runId: run.id, inFlight: false };

      const inFlight = await tx.query.syncRuns.findFirst({
        where: and(
          eq(syncRuns.tenantId, tenantId),
          eq(syncRuns.status, "running"),
        ),
      });
      if (!inFlight)
        throw new Error("The concurrent sync already finished. Retry sync.");
      return { runId: inFlight.id, inFlight: true };
    })
    .catch((error: unknown) => {
      if (error instanceof WorkspaceUpdateInProgressError) return null;
      throw error;
    });
  if (!started) return { runId: null, status: "running", steps: [] };
  const { runId } = started;
  if (started.inFlight) return { runId, status: "running", steps: [] };

  // Each recorded step is also written to the running row, so the status poll
  // can show progress before the run finishes.
  const log = createStepLog((soFar) => persistRunSteps(runId, soFar));
  const { steps, record } = log;
  const now = new Date();

  try {
    // Demo workspaces self-heal their price book: visitors may edit prices,
    // so every demo sync drops the rows and the prefill blocks below rebuild
    // them from the one canonical source (skuCatalog defaults plus the
    // DEMO_ADOBE_PRICES / DEMO_SAAS_PRICES estimates, source "default"),
    // before the analysis reads prices. Keeps the live demo aligned with the
    // marketing figures in demoFigures.ts; never touches non-demo tenants.
    if (tenant.isDemo) {
      await db.delete(priceBook).where(eq(priceBook.tenantId, tenantId));
    }

    // --- Pull phase -----------------------------------------------------
    let orgName: string | null = null;
    let skus: GraphSubscribedSku[] = [];
    /** Per-SKU trial seats and renewal dates; null keeps the stored values. */
    let skuTerms: Map<string, SkuTerms> | null = new Map();
    let concealmentSetting: boolean | null = null;
    let graphUsers: GraphUser[] = [];
    let hasP1 = true;
    let usageRows: UsageReportRow[] = [];
    let usageReportUnavailable = false;
    let previousActivity:
      | Map<
          string,
          Pick<
            typeof tenantUsers.$inferSelect,
            "workloadActivity" | "lastActivity"
          >
        >
      | undefined;
    let copilotRows: CopilotUsageRow[] = [];

    if (!client) {
      for (const step of MICROSOFT_STEPS) {
        record({
          step,
          status: "skipped",
          message: "Microsoft 365 is not connected",
          durationMs: 0,
        });
      }
    } else {
      let started = Date.now();
      try {
        // Graph returns some part numbers with zero-width characters; the
        // upsert below rewrites stored rows with the cleaned value.
        skus = (await client.getSubscribedSkus()).map((s) => ({
          ...s,
          skuPartNumber: cleanPartNumber(s.skuPartNumber),
        }));
        record({
          step: "subscribedSkus",
          status: "ok",
          count: skus.length,
          durationMs: since(started),
        });
      } catch (err) {
        record({
          step: "subscribedSkus",
          status: "failed",
          message: errText(err),
          durationMs: since(started),
        });
        throw err; // critical: nothing useful without SKUs
      }

      // Read the name only after the critical SKU pull, so the non-critical
      // lookup cannot consume the propagation budget the SKU retry needs.
      orgName = await client.getOrganizationName();

      started = Date.now();
      try {
        concealmentSetting = await client.getReportConcealment();
        record({
          step: "reportSettings",
          status: concealmentSetting === null ? "warning" : "ok",
          message:
            concealmentSetting === null
              ? "Could not read /admin/reportSettings"
              : `displayConcealedNames=${concealmentSetting}`,
          durationMs: since(started),
        });
      } catch {
        record({
          step: "reportSettings",
          status: "warning",
          durationMs: since(started),
        });
      }

      started = Date.now();
      try {
        const signInStarted = Date.now();
        try {
          graphUsers = await client.listUsers({ includeSignInActivity: true });
          record({
            step: "signInActivity",
            status: "ok",
            durationMs: since(signInStarted),
          });
        } catch (err) {
          if (err instanceof PremiumLicenseRequiredError) {
            hasP1 = false;
            record({
              step: "signInActivity",
              status: "skipped",
              message:
                "Sign-in activity unavailable (no Entra ID P1/P2, or AuditLog.Read.All not granted); falling back to usage reports",
              durationMs: since(signInStarted),
            });
            graphUsers = await client.listUsers({
              includeSignInActivity: false,
            });
          } else {
            throw err;
          }
        }
        record({
          step: "users",
          status: "ok",
          count: graphUsers.length,
          durationMs: since(started),
        });
      } catch (err) {
        record({
          step: "users",
          status: "failed",
          message: errText(err),
          durationMs: since(started),
        });
        throw err; // critical
      }

      // Trial seats and renewal dates, read after the critical directory
      // pulls on a bounded budget of its own, so throttling here can never
      // starve them or the reports that follow. Never critical: without the
      // data the shelfware rule counts every prepaid seat as paid, as before.
      started = Date.now();
      const subscriptionsDeadline = optionalStepDeadline(deadline);
      if (!client.getSubscriptions) {
        record({
          step: "subscriptions",
          status: "skipped",
          message: "Trial and renewal data is not read by this connection",
          durationMs: 0,
        });
      } else if (subscriptionsDeadline === null) {
        skuTerms = null; // keep the stored values
        record({
          step: "subscriptions",
          status: "skipped",
          message:
            "Not enough sync time left; kept the last trial and renewal data",
          durationMs: 0,
        });
      } else {
        try {
          const subscriptions = (
            await client.getSubscriptions(subscriptionsDeadline)
          ).map((s) => ({
            ...s,
            skuPartNumber: cleanPartNumber(s.skuPartNumber),
          }));
          skuTerms = subscriptionTermsBySku(subscriptions);
          record({
            step: "subscriptions",
            status: "ok",
            count: subscriptions.length,
            durationMs: since(started),
          });
        } catch (err) {
          const denied =
            err instanceof GraphHttpError &&
            (err.status === 401 || err.status === 403);
          // Denied: this tenant does not expose the data, so trial seats are
          // not adjusted at all. Transient failure or timeout: keep the stored
          // values so trial seats do not flip into shelfware for one run.
          if (!denied) skuTerms = null;
          record({
            step: "subscriptions",
            status: denied ? "skipped" : "warning",
            message: denied
              ? "Trial and renewal data is not available for this tenant"
              : errText(err),
            durationMs: since(started),
          });
        }
      }

      started = Date.now();
      let report: ActiveUserDetailReport | undefined;
      try {
        report = await client.getActiveUserDetail("D90");
      } catch (err) {
        record({
          step: "usageReports",
          status: "warning",
          message: errText(err),
          durationMs: since(started),
        });
      }

      const licensedUpns = new Set(
        graphUsers
          .filter((user) => user.assignedLicenses.length > 0)
          .map((user) => user.userPrincipalName.toLowerCase()),
      );
      // Concealed identities can still supply a usable tenant-wide count.
      if (
        report?.rows.some(
          (row) =>
            isConcealedUpn(row.userPrincipalName) ||
            licensedUpns.has(row.userPrincipalName.toLowerCase()),
        )
      ) {
        usageRows = report.rows;
      } else {
        const stored = await db.query.tenantUsers.findMany({
          where: eq(tenantUsers.tenantId, tenantId),
          columns: {
            graphId: true,
            lastActivity: true,
            workloadActivity: true,
          },
        });
        // Stored dates and counts remain useful even during a long outage.
        // Recent successful report steps also cover reports with only null
        // dates. That evidence expires after 30 days without fresh rows.
        usageReportUnavailable =
          (tenant.usageAggregate?.totalCount ?? 0) > 0 ||
          stored.some(({ workloadActivity: w }) =>
            [w?.exchange, w?.oneDrive, w?.sharePoint, w?.teams].some(Boolean),
          ) ||
          Boolean(
            await db.query.syncRuns.findFirst({
              where: and(
                eq(syncRuns.tenantId, tenantId),
                inArray(syncRuns.status, ["success", "partial"]),
                gte(
                  syncRuns.startedAt,
                  new Date(now.getTime() - USAGE_REPORT_LOOKBACK_MS),
                ),
                sql`jsonb_path_exists(${syncRuns.steps}, '$[*] ? (@.step == "usageReports" && @.status == "ok" && @.count > 0)')`,
              ),
              columns: { id: true },
            }),
          );
        if (usageReportUnavailable) {
          previousActivity = new Map(
            stored.map((user) => [user.graphId, user]),
          );
        }
      }

      if (report) {
        record({
          step: "usageReports",
          status: usageReportUnavailable ? "warning" : "ok",
          message: usageReportUnavailable
            ? emptyUsageMessage(report)
            : undefined,
          count: usageRows.length,
          durationMs: since(started),
        });
      }

      started = Date.now();
      try {
        copilotRows = await client.getCopilotUsage("D90");
        record({
          step: "copilotUsage",
          status: "ok",
          count: copilotRows.length,
          durationMs: since(started),
        });
      } catch (err) {
        record({
          step: "copilotUsage",
          status: "warning",
          message: errText(err),
          durationMs: since(started),
        });
      }
    }

    // --- Adobe: entitlements for offboarding-leak detection ----------------
    let adobeRows: AdobeUser[] = [];
    let adobeActive = false;
    const adobeConn = await db.query.adobeConnections.findFirst({
      where: eq(adobeConnections.tenantId, tenantId),
    });
    if (tenant.isDemo || adobeConn) {
      adobeActive = true;
      const started = Date.now();
      try {
        if (outOfTime()) {
          throw new Error("Sync deadline reached; using stored data");
        }
        const adobeClient = tenant.isDemo
          ? new DemoAdobeClient()
          : new UmapiClient({
              orgId: adobeConn!.orgId,
              clientId: adobeConn!.clientId,
              clientSecret: decryptSecret(
                adobeConn!.clientSecretEnc,
                secretAad(adobeConn!.tenantId, "adobe", "clientSecretEnc"),
              ),
            });
        adobeRows = mergeAdobeUsers(await adobeClient.getUsers());
        record({
          step: "adobeUsers",
          status: "ok",
          count: adobeRows.length,
          durationMs: since(started),
        });
        if (adobeConn) {
          await db
            .update(adobeConnections)
            .set({ lastSyncAt: now, lastSyncStatus: "ok" })
            .where(eq(adobeConnections.tenantId, tenantId));
        }
      } catch (err) {
        // adobeActive=false skips persistence/pruning; the stored snapshot is
        // analyzed instead so findings survive a transient UMAPI failure
        // rather than auto-resolving and reopening (same pattern as the
        // generic SaaS connectors below).
        adobeActive = false;
        record({
          step: "adobeUsers",
          status: "warning",
          message: errText(err),
          durationMs: since(started),
        });
        const stored = await db.query.adobeUsers.findMany({
          where: eq(adobeUsersTable.tenantId, tenantId),
        });
        adobeRows = stored.map((r) => ({
          email: r.email,
          status: r.status,
          products: r.products,
        }));
        if (adobeConn) {
          await db
            .update(adobeConnections)
            .set({ lastSyncAt: now, lastSyncStatus: "failed" })
            .where(eq(adobeConnections.tenantId, tenantId));
        }
      }
    }

    // --- SaaS connectors: Zoom, Atlassian, Salesforce, OpenAI,
    // Anthropic (the AI pair also syncs daily API spend) -------------------
    // Seats per provider that produced data this run. On a transient fetch
    // failure the stored snapshot is analyzed instead, so findings survive a
    // flaky provider API rather than auto-resolving and reopening.
    const saasRows = new Map<SaasProvider, SaasSeat[]>();
    const saasPersist = new Set<SaasProvider>();
    const saasConns = tenant.isDemo
      ? []
      : await db.query.saasConnections.findMany({
          where: eq(saasConnections.tenantId, tenantId),
        });
    const activeSaas: SaasProvider[] = tenant.isDemo
      ? [...SAAS_PROVIDERS]
      : saasConns.map((c) => c.provider);
    for (const provider of activeSaas) {
      const conn = saasConns.find((c) => c.provider === provider);
      const started = Date.now();
      try {
        if (outOfTime()) {
          throw new Error("Sync deadline reached; using stored data");
        }
        const saasClient = tenant.isDemo
          ? demoSaasClient(provider)
          : await buildSaasClient(provider, {
              orgRef: conn!.orgRef,
              clientId: conn!.clientId,
              secret: decryptSecret(
                conn!.secretEnc,
                secretAad(conn!.tenantId, conn!.provider, "secretEnc"),
              ),
            });
        const seats = mergeSaasSeats(await saasClient.getSeats());
        saasRows.set(provider, seats);
        saasPersist.add(provider);
        record({
          step: `${provider}Seats`,
          status: "ok",
          count: seats.length,
          durationMs: since(started),
        });
        if (conn) {
          await db
            .update(saasConnections)
            .set({ lastSyncAt: now, lastSyncStatus: "ok" })
            .where(
              and(
                eq(saasConnections.tenantId, tenantId),
                eq(saasConnections.provider, provider),
              ),
            );
        }
        if (provider === "openai" || provider === "anthropic") {
          await syncAiSpend(
            tenantId,
            provider,
            saasClient as AiSpendClient,
            now,
            record,
            deadline,
          );
        }
      } catch (err) {
        record({
          step: `${provider}Seats`,
          status: "warning",
          message: errText(err),
          durationMs: since(started),
        });
        const stored = await db.query.saasSeats.findMany({
          where: and(
            eq(saasSeatsTable.tenantId, tenantId),
            eq(saasSeatsTable.provider, provider),
          ),
        });
        saasRows.set(
          provider,
          stored.map((r) => ({
            email: r.email,
            displayName: r.displayName,
            status: r.status,
            products: r.products,
            lastActiveAt: r.lastActiveAt,
          })),
        );
        if (conn) {
          await db
            .update(saasConnections)
            .set({ lastSyncAt: now, lastSyncStatus: "failed" })
            .where(
              and(
                eq(saasConnections.tenantId, tenantId),
                eq(saasConnections.provider, provider),
              ),
            );
        }
      }
    }

    // Import-based connectors (chatgpt/claude) have no API client: their
    // stored seats are replaced only by a new CSV import and never pruned by
    // sync, but they join the analysis on every run. Demo tenants get their
    // fixtures through the regular loop above instead.
    if (!tenant.isDemo) {
      for (const provider of IMPORT_PROVIDERS) {
        if (saasRows.has(provider)) continue;
        const started = Date.now();
        const stored = await db.query.saasSeats.findMany({
          where: and(
            eq(saasSeatsTable.tenantId, tenantId),
            eq(saasSeatsTable.provider, provider),
          ),
        });
        if (stored.length === 0) continue;
        saasRows.set(
          provider,
          stored.map((r) => ({
            email: r.email,
            displayName: r.displayName,
            status: r.status,
            products: r.products,
            lastActiveAt: r.lastActiveAt,
          })),
        );
        record({
          step: `${provider}Seats`,
          status: "ok",
          count: stored.length,
          message: "imported snapshot",
          durationMs: since(started),
        });
      }
    }

    // --- Join + analyze ---------------------------------------------------
    const analysisStarted = Date.now();
    const joined = joinSignals({
      graphUsers,
      usageRows,
      copilotRows,
      hasP1,
      previousActivity,
      reportUnavailable: usageReportUnavailable,
    });

    // A failed subscriptions read keeps the trial seats and renewal dates of
    // the last successful one.
    if (skuTerms === null) {
      const stored = await db.query.tenantSkus.findMany({
        where: eq(tenantSkus.tenantId, tenantId),
        columns: { skuId: true, trialUnits: true, nextLifecycleAt: true },
      });
      skuTerms = new Map(
        stored.map((r) => [
          r.skuId,
          { trialUnits: r.trialUnits, nextLifecycleAt: r.nextLifecycleAt },
        ]),
      );
    }
    const termsOf = (skuId: string): SkuTerms =>
      skuTerms?.get(skuId) ?? { trialUnits: 0, nextLifecycleAt: null };

    // --- Persist phase (upsert + prune; no destructive window) -------------
    await db.transaction(async (tx) => {
      if (skus.length > 0) {
        for (const batch of chunk(skus, 250)) {
          await tx
            .insert(tenantSkus)
            .values(
              batch.map((s) => ({
                tenantId,
                skuId: s.skuId,
                skuPartNumber: s.skuPartNumber,
                displayName: skuDisplayName(s.skuId, s.skuPartNumber),
                prepaidEnabled: s.prepaidUnits.enabled,
                prepaidSuspended: s.prepaidUnits.suspended,
                prepaidWarning: s.prepaidUnits.warning,
                consumedUnits: s.consumedUnits,
                trialUnits: termsOf(s.skuId).trialUnits,
                nextLifecycleAt: termsOf(s.skuId).nextLifecycleAt,
                updatedAt: now,
              })),
            )
            .onConflictDoUpdate({
              target: [tenantSkus.tenantId, tenantSkus.skuId],
              set: {
                skuPartNumber: sql`excluded.sku_part_number`,
                displayName: sql`excluded.display_name`,
                prepaidEnabled: sql`excluded.prepaid_enabled`,
                prepaidSuspended: sql`excluded.prepaid_suspended`,
                prepaidWarning: sql`excluded.prepaid_warning`,
                consumedUnits: sql`excluded.consumed_units`,
                trialUnits: sql`excluded.trial_units`,
                nextLifecycleAt: sql`excluded.next_lifecycle_at`,
                updatedAt: sql`excluded.updated_at`,
              },
            });
        }
      }
      // Prune only when Graph returned data; an empty result keeps the last
      // known inventory instead of wiping it (defensive against odd responses).
      if (skus.length > 0) {
        await tx
          .delete(tenantSkus)
          .where(
            and(
              eq(tenantSkus.tenantId, tenantId),
              notInArray(tenantSkus.skuId, textSet(skus.map((s) => s.skuId))),
            ),
          );
      }
    });

    for (const batch of chunk(joined.users, 250)) {
      await db
        .insert(tenantUsers)
        .values(
          batch.map((u) => ({
            tenantId,
            graphId: u.graphId,
            upn: u.upn,
            mailAliases: u.mailAliases,
            displayName: u.displayName,
            accountEnabled: u.accountEnabled,
            userType: u.userType,
            createdDateTime: u.createdDateTime,
            lastInteractiveSignIn: u.lastInteractiveSignIn,
            lastNonInteractiveSignIn: u.lastNonInteractiveSignIn,
            lastActivity: u.lastActivity,
            workloadActivity: u.workloadActivity,
            licenses: u.licenses,
            syncedAt: now,
          })),
        )
        .onConflictDoUpdate({
          target: [tenantUsers.tenantId, tenantUsers.graphId],
          set: {
            upn: sql`excluded.upn`,
            mailAliases: sql`excluded.mail_aliases`,
            displayName: sql`excluded.display_name`,
            accountEnabled: sql`excluded.account_enabled`,
            userType: sql`excluded.user_type`,
            createdDateTime: sql`excluded.created_date_time`,
            lastInteractiveSignIn: sql`excluded.last_interactive_sign_in`,
            lastNonInteractiveSignIn: sql`excluded.last_non_interactive_sign_in`,
            lastActivity: sql`excluded.last_activity`,
            workloadActivity: sql`excluded.workload_activity`,
            licenses: sql`excluded.licenses`,
            syncedAt: sql`excluded.synced_at`,
          },
        });
    }
    if (joined.users.length > 0) {
      await db
        .delete(tenantUsers)
        .where(
          and(
            eq(tenantUsers.tenantId, tenantId),
            notInArray(
              tenantUsers.graphId,
              textSet(joined.users.map((u) => u.graphId)),
            ),
          ),
        );
    }

    // Persist Adobe users (upsert + prune) when the connector is active.
    if (adobeActive) {
      await db.transaction(async (tx) => {
        if (adobeRows.length > 0) {
          for (const batch of chunk(adobeRows, 250)) {
            await tx
              .insert(adobeUsersTable)
              .values(
                batch.map((u) => ({
                  tenantId,
                  email: u.email.toLowerCase(),
                  status: u.status,
                  products: u.products,
                  syncedAt: now,
                })),
              )
              .onConflictDoUpdate({
                target: [adobeUsersTable.tenantId, adobeUsersTable.email],
                set: {
                  status: sql`excluded.status`,
                  products: sql`excluded.products`,
                  syncedAt: sql`excluded.synced_at`,
                },
              });
          }
          await tx
            .delete(adobeUsersTable)
            .where(
              and(
                eq(adobeUsersTable.tenantId, tenantId),
                notInArray(
                  adobeUsersTable.email,
                  textSet(adobeRows.map((u) => u.email.toLowerCase())),
                ),
              ),
            );
        } else {
          await tx
            .delete(adobeUsersTable)
            .where(eq(adobeUsersTable.tenantId, tenantId));
        }
      });
    }

    // Persist SaaS seats (upsert + prune) for providers that fetched cleanly.
    for (const provider of saasPersist) {
      const seats = saasRows.get(provider) ?? [];
      await db.transaction(async (tx) => {
        if (seats.length > 0) {
          for (const batch of chunk(seats, 250)) {
            await tx
              .insert(saasSeatsTable)
              .values(
                batch.map((s) => ({
                  tenantId,
                  provider,
                  email: s.email.toLowerCase(),
                  displayName: s.displayName,
                  status: s.status,
                  products: s.products,
                  lastActiveAt: s.lastActiveAt,
                  syncedAt: now,
                })),
              )
              .onConflictDoUpdate({
                target: [
                  saasSeatsTable.tenantId,
                  saasSeatsTable.provider,
                  saasSeatsTable.email,
                ],
                set: {
                  displayName: sql`excluded.display_name`,
                  status: sql`excluded.status`,
                  products: sql`excluded.products`,
                  lastActiveAt: sql`excluded.last_active_at`,
                  syncedAt: sql`excluded.synced_at`,
                },
              });
          }
          await tx
            .delete(saasSeatsTable)
            .where(
              and(
                eq(saasSeatsTable.tenantId, tenantId),
                eq(saasSeatsTable.provider, provider),
                notInArray(
                  saasSeatsTable.email,
                  textSet(seats.map((s) => s.email.toLowerCase())),
                ),
              ),
            );
        } else {
          await tx
            .delete(saasSeatsTable)
            .where(
              and(
                eq(saasSeatsTable.tenantId, tenantId),
                eq(saasSeatsTable.provider, provider),
              ),
            );
        }
      });
    }

    // Prefill missing price book rows from the static catalog.
    const existingPrices = await db.query.priceBook.findMany({
      where: eq(priceBook.tenantId, tenantId),
    });
    const known = new Set(existingPrices.map((p) => p.skuId));
    // Catalog prices added after a row was prefilled: a row still on the
    // catalog's old fallback of 0 picks up the new list price. Only rows the
    // customer never touched (source "default") qualify; any edited price
    // is "custom" and is never overwritten.
    const skuIds = new Set(skus.map((s) => s.skuId));
    for (const p of existingPrices) {
      if (
        p.source !== "default" ||
        p.monthlyPriceCents !== 0 ||
        !skuIds.has(p.skuId)
      ) {
        continue;
      }
      const price = skuDefaultPriceCents(p.skuId, tenant.currencyRatePpm);
      if (price === 0) continue;
      await db
        .update(priceBook)
        .set({ monthlyPriceCents: price, updatedAt: now })
        .where(
          and(
            eq(priceBook.tenantId, tenantId),
            eq(priceBook.skuId, p.skuId),
            eq(priceBook.source, "default"),
            eq(priceBook.monthlyPriceCents, 0),
          ),
        );
    }
    const missing = skus.filter((s) => !known.has(s.skuId));
    if (missing.length > 0) {
      for (const batch of chunk(missing, 250)) {
        await db.insert(priceBook).values(
          batch.map((s) => ({
            tenantId,
            skuId: s.skuId,
            monthlyPriceCents: skuDefaultPriceCents(
              s.skuId,
              tenant.currencyRatePpm,
            ),
            source: "default" as const,
          })),
        );
      }
    }

    // Prefill Adobe product prices (demo gets plausible list estimates).
    const DEMO_ADOBE_PRICES: Record<string, number> = {
      "Creative Cloud All Apps": 7100,
      "Acrobat Pro": 2000,
      Photoshop: 2400,
    };
    const adobeProducts = [...new Set(adobeRows.flatMap((u) => u.products))];
    const missingAdobe = adobeProducts
      .map(adobePriceKey)
      .filter((id) => !known.has(id));
    if (missingAdobe.length > 0) {
      for (const batch of chunk(missingAdobe, 250)) {
        await db
          .insert(priceBook)
          .values(
            batch.map((id) => ({
              tenantId,
              skuId: id,
              monthlyPriceCents: tenant.isDemo
                ? (DEMO_ADOBE_PRICES[id.slice("adobe:".length)] ?? 0)
                : 0,
              source: "default" as const,
            })),
          )
          .onConflictDoNothing();
      }
    }

    // Prefill SaaS connector prices (demo gets plausible list estimates).
    const missingSaas = [...saasRows.entries()]
      .flatMap(([provider, seats]) =>
        [...new Set(seats.flatMap((s) => s.products))].map((p) =>
          saasPriceKey(provider, p),
        ),
      )
      .filter((id) => !known.has(id));
    if (missingSaas.length > 0) {
      for (const batch of chunk(missingSaas, 250)) {
        await db
          .insert(priceBook)
          .values(
            batch.map((id) => ({
              tenantId,
              skuId: id,
              monthlyPriceCents: tenant.isDemo
                ? (DEMO_SAAS_PRICES[id] ?? 0)
                : 0,
              source: "default" as const,
            })),
          )
          .onConflictDoNothing();
      }
    }
    const prices = Object.fromEntries(
      (
        await db.query.priceBook.findMany({
          where: eq(priceBook.tenantId, tenantId),
        })
      ).map((p) => [p.skuId, p.monthlyPriceCents]),
    );

    const inventory = skus.map((s) => ({
      skuId: s.skuId,
      skuPartNumber: s.skuPartNumber,
      prepaidEnabled: s.prepaidUnits.enabled,
      consumedUnits: s.consumedUnits,
      trialUnits: termsOf(s.skuId).trialUnits,
    }));
    const newFindings = await analyzeWasteWithCoverage(tenantId, {
      users: joined.users,
      skus: inventory,
      prices,
      now,
      activitySignal: joined.activitySignal,
      copilotSignal: joined.copilotSignal,
      usageAggregate: joined.usageAggregate,
      copilotAggregate: joined.copilotAggregate,
      inactiveDays: tenant.inactiveDays,
      exclusions: tenant.findingExclusions,
    });
    // Every sign-in name plus mail alias of each directory user, so connector
    // seats registered under an alias still match. The aliases are stored on
    // tenant_users, so runAnalysis builds the very same identities.
    // No Graph pull this run (Microsoft not connected, or an empty result that
    // left the stored inventory alone): correlate against the stored directory
    // instead, which a CSV import fills without any Microsoft connection.
    // Dropping it here would resolve the leak findings runAnalysis creates and
    // recreate them on the next analysis.
    const directory =
      graphUsers.length > 0
        ? joined.users
        : await db.query.tenantUsers.findMany({
            where: eq(tenantUsers.tenantId, tenantId),
          });
    const entraIdentities = directoryIdentitiesOf(directory);
    const seatExcluded = connectorSeatExclusion(
      tenant.findingExclusions,
      directory,
    );
    const adobeFindings = analyzeAdobeWaste(
      adobeRows.filter((u) => !seatExcluded(u)),
      entraIdentities,
      prices,
    );
    const saasFindings = [...saasRows.entries()].flatMap(([provider, seats]) =>
      analyzeSaasWaste(
        provider,
        seats.filter((seat) => !seatExcluded(seat)),
        entraIdentities,
        prices,
        { inactiveDays: tenant.inactiveDays, now },
      ),
    );
    const allFindings = newFindings.concat(adobeFindings, saasFindings);
    record({
      step: "wasteAnalysis",
      status: "ok",
      count: allFindings.length,
      durationMs: since(analysisStarted),
    });

    const inserted = await diffFindings(
      tenantId,
      allFindings,
      now,
      joined.activitySignal,
    );
    await sendLeakAlert(tenant, inserted, now);

    // --- Snapshot + tenant capabilities ------------------------------------
    const totalMonthlySpendCents = monthlyBilledSpendOf(
      inventory,
      (skuId) => prices[skuId] ?? 0,
    );
    const openRows = await db.query.findings.findMany({
      where: and(
        eq(findings.tenantId, tenantId),
        inArray(findings.status, ["open", "acknowledged"]),
      ),
    });
    const totalMonthlyWasteCents = openRows.reduce(
      (sum, f) => sum + f.monthlyImpactCents,
      0,
    );

    const day = now.toISOString().slice(0, 10);
    const purchasedSeats = purchasedSeatsOf(inventory);
    const assignedSeats = assignedSeatsOf(inventory);
    await db
      .insert(snapshots)
      .values({
        tenantId,
        day,
        totalMonthlySpendCents,
        totalMonthlyWasteCents,
        purchasedSeats,
        assignedSeats,
        bySku: bySkuOf(inventory),
      })
      .onConflictDoUpdate({
        target: [snapshots.tenantId, snapshots.day],
        set: {
          totalMonthlySpendCents,
          totalMonthlyWasteCents,
          purchasedSeats,
          assignedSeats,
          bySku: bySkuOf(inventory),
        },
      });

    // Directory capabilities describe the Microsoft connection; a workspace
    // without one keeps its stored values untouched.
    if (client) {
      await db
        .update(tenants)
        .set({
          hasP1,
          concealedNames:
            concealmentSetting ??
            (joined.concealed
              ? true
              : usageRows.length > 0
                ? false
                : tenant.concealedNames),
          activitySignal: joined.activitySignal,
          usageReportUnavailable,
          copilotSignal: joined.copilotSignal,
          usageAggregate: usageReportUnavailable
            ? tenant.usageAggregate
            : (joined.usageAggregate ?? null),
          copilotAggregate: joined.copilotAggregate ?? null,
          ...(orgName && !tenant.isDemo ? { name: orgName } : {}),
        })
        .where(eq(tenants.id, tenantId));
    }

    const status: SyncRunStatus = steps.some((s) => s.status === "failed")
      ? "partial"
      : "success";
    await log.settled();
    await db
      .update(syncRuns)
      .set({ status, steps, finishedAt: new Date() })
      .where(eq(syncRuns.id, runId));
    // The Microsoft connection authenticated and pulled data: clear any prior
    // credential error and stamp the verification time (no-op for tenants
    // without an msConnections row).
    if (client && !tenant.isDemo) {
      await db
        .update(msConnections)
        .set({ lastVerifiedAt: new Date(), lastVerifyError: null })
        .where(eq(msConnections.tenantId, tenantId));
    }
    return { runId, status, steps };
  } catch (err) {
    const message = errText(err);
    // App-only auth failure (expired/revoked BYO secret or certificate, or
    // managed re-consent needed): record a clean, non-leaking marker on the
    // connection so the dashboard can prompt a re-enter, without crashing the
    // run. The nightly cron catches per-tenant and continues.
    if (!tenant.isDemo && isAppAuthError(message)) {
      await db
        .update(msConnections)
        .set({
          lastVerifyError:
            "Microsoft rejected the stored credential (it may be expired or revoked). Re-enter it on the Microsoft connector page.",
        })
        .where(eq(msConnections.tenantId, tenantId));
    }
    await log.settled();
    await db
      .update(syncRuns)
      .set({
        status: "failed",
        steps,
        error: message,
        finishedAt: new Date(),
      })
      .where(eq(syncRuns.id, runId));
    void notifyOps(
      `sync FAILED for workspace ${tenantId}: ${opsErrorText(err)}`,
      {
        key: `sync:${tenantId}`,
        cooldownMs: 30 * 60 * 1000,
      },
    );
    return { runId, status: "failed", steps };
  }
};

type StoredUser = typeof tenantUsers.$inferSelect;
type StoredFinding = typeof findings.$inferSelect;
type FindingIdentity = Pick<StoredFinding, "id" | "rule" | "graphUserId">;

export type FindingStatusChange = FindingIdentity & {
  before: Pick<StoredFinding, "status" | "resolvedAt"> | null;
  after: Pick<StoredFinding, "status" | "resolvedAt">;
};

type ActivityReconciliation = {
  preview: boolean;
  includes: (finding: Pick<StoredFinding, "rule" | "graphUserId">) => boolean;
  protects: (finding: StoredFinding) => boolean;
  changes: FindingStatusChange[];
};

type ActivityAnalysisOptions = {
  database: Db;
  now: Date;
  users: ReadonlyMap<
    string,
    Pick<StoredUser, "lastActivity" | "workloadActivity">
  >;
  copilotChanged: ReadonlySet<string>;
  reconcile: ActivityReconciliation;
};

/**
 * Re-runs the waste analysis from data already in the database, used after
 * price book edits so impact figures update without a Graph round trip.
 * Falls back gracefully when the tenant has never synced.
 */
export const runAnalysis = async (
  tenantId: string,
  activity?: ActivityAnalysisOptions,
): Promise<void> => {
  if (activity)
    return analyzeStoredTenant(tenantId, activity.database, activity);
  await db.transaction(async (tx) => {
    await lockTenantForWorkspaceUpdate(tx, tenantId);
    await analyzeStoredTenant(tenantId, tx);
  });
};

async function analyzeStoredTenant(
  tenantId: string,
  database: Db,
  activity?: ActivityAnalysisOptions,
) {
  const tenant = await database.query.tenants.findFirst({
    where: eq(tenants.id, tenantId),
  });
  if (!tenant) throw new Error(`Unknown tenant ${tenantId}`);

  const [skuRows, userRows, priceRows, adobeRows, saasSeatRows] =
    await Promise.all([
      database.query.tenantSkus.findMany({
        where: eq(tenantSkus.tenantId, tenantId),
      }),
      database.query.tenantUsers.findMany({
        where: eq(tenantUsers.tenantId, tenantId),
      }),
      database.query.priceBook.findMany({
        where: eq(priceBook.tenantId, tenantId),
      }),
      database.query.adobeUsers.findMany({
        where: eq(adobeUsersTable.tenantId, tenantId),
      }),
      database.query.saasSeats.findMany({
        where: eq(saasSeatsTable.tenantId, tenantId),
      }),
    ]);
  // Nothing synced yet from any source: keep the stored findings untouched.
  // Adobe/SaaS rows alone are enough to analyze (workspaces without a
  // Microsoft connection), and vanished seats then resolve their findings.
  if (
    skuRows.length === 0 &&
    userRows.length === 0 &&
    adobeRows.length === 0 &&
    saasSeatRows.length === 0
  )
    return;

  const now = activity?.now ?? new Date();
  const prices = Object.fromEntries(
    priceRows.map((p) => [p.skuId, p.monthlyPriceCents]),
  );

  // Older workspaces predate the stored coverage signal.
  const activitySignal =
    tenant.activitySignal ??
    (tenant.hasP1 || tenant.concealedNames === false ? "full" : "none");
  const users = userRows.map((row) => {
    const r = { ...row, ...activity?.users.get(row.graphId) };
    return {
      graphId: r.graphId,
      upn: r.upn,
      displayName: r.displayName,
      accountEnabled: r.accountEnabled,
      userType: r.userType,
      createdDateTime: r.createdDateTime,
      lastActivity: r.lastActivity,
      copilotLastActivity: r.workloadActivity?.copilot
        ? new Date(r.workloadActivity.copilot)
        : null,
      licenses: r.licenses,
    };
  });
  const inputs = {
    skus: skuRows,
    prices,
    now,
    inactiveDays: tenant.inactiveDays,
    exclusions: tenant.findingExclusions,
  };

  if (activity) {
    const evaluated = new Map<string, Set<WasteRuleId>>();
    const newFindings = analyzeWaste({
      ...inputs,
      users: users.filter((user) => activity.users.has(user.graphId)),
      activitySignal: "full",
      copilotSignal: "per-user",
      onActivityEvaluated: (user, rule) => {
        const graphId = user.graphId.toLowerCase();
        const hasEvidence =
          rule === "copilot_unused"
            ? activity.copilotChanged.has(graphId) &&
              Number.isFinite(user.copilotLastActivity?.getTime())
            : Number.isFinite(user.lastActivity?.getTime());
        if (!hasEvidence) return;
        const rules = evaluated.get(graphId) ?? new Set<WasteRuleId>();
        rules.add(rule);
        evaluated.set(graphId, rules);
      },
    });
    const includes: ActivityReconciliation["includes"] = (finding) =>
      finding.graphUserId !== null &&
      evaluated.get(finding.graphUserId.toLowerCase())?.has(finding.rule) ===
        true &&
      activity.reconcile.includes(finding);
    await diffFindings(tenantId, newFindings.filter(includes), now, "full", {
      database,
      reconcile: { ...activity.reconcile, includes },
    });
    return;
  }

  const newFindings = await analyzeWasteWithCoverage(
    tenantId,
    {
      ...inputs,
      users,
      activitySignal,
      copilotSignal: tenant.copilotSignal ?? "none",
      // An outage can leave an aggregate stored even when there are no users.
      usageAggregate: tenant.usageReportUnavailable
        ? undefined
        : (tenant.usageAggregate ?? undefined),
      copilotAggregate: tenant.copilotAggregate ?? undefined,
    },
    database,
  );

  const entraIdentities = directoryIdentitiesOf(userRows);
  const seatExcluded = connectorSeatExclusion(
    tenant.findingExclusions,
    userRows,
  );
  const adobeFindings = analyzeAdobeWaste(
    adobeRows
      .filter((r) => !seatExcluded(r))
      .map((r) => ({
        email: r.email,
        status: r.status,
        products: r.products,
      })),
    entraIdentities,
    prices,
  );
  const seatsByProvider = new Map<SaasProvider, SaasSeat[]>();
  for (const r of saasSeatRows) {
    if (seatExcluded(r)) continue;
    const list = seatsByProvider.get(r.provider) ?? [];
    list.push({
      email: r.email,
      displayName: r.displayName,
      status: r.status,
      products: r.products,
      lastActiveAt: r.lastActiveAt,
    });
    seatsByProvider.set(r.provider, list);
  }
  const saasFindings = [...seatsByProvider.entries()].flatMap(
    ([provider, seats]) =>
      analyzeSaasWaste(provider, seats, entraIdentities, prices, {
        inactiveDays: tenant.inactiveDays,
        now,
      }),
  );

  await diffFindings(
    tenantId,
    newFindings.concat(adobeFindings, saasFindings),
    now,
    activitySignal,
    { database },
  );

  const totalMonthlySpendCents = monthlyBilledSpendOf(
    skuRows,
    (skuId) => prices[skuId] ?? 0,
  );
  const openRows = await database.query.findings.findMany({
    where: and(
      eq(findings.tenantId, tenantId),
      inArray(findings.status, ["open", "acknowledged"]),
    ),
  });
  const totalMonthlyWasteCents = openRows.reduce(
    (sum, f) => sum + f.monthlyImpactCents,
    0,
  );
  const day = now.toISOString().slice(0, 10);
  const purchasedSeats = purchasedSeatsOf(skuRows);
  const assignedSeats = assignedSeatsOf(skuRows);
  await database
    .insert(snapshots)
    .values({
      tenantId,
      day,
      totalMonthlySpendCents,
      totalMonthlyWasteCents,
      purchasedSeats,
      assignedSeats,
      bySku: bySkuOf(skuRows),
    })
    .onConflictDoUpdate({
      target: [snapshots.tenantId, snapshots.day],
      set: {
        totalMonthlySpendCents,
        totalMonthlyWasteCents,
        purchasedSeats,
        assignedSeats,
        bySku: bySkuOf(skuRows),
      },
    });
}

/** A finding row genuinely inserted by diffFindings (first appearance, not a reopen/update). */
export type InsertedFinding = {
  id: string;
  rule: WasteRuleId;
  title: string;
  monthlyImpactCents: number;
};

/**
 * Reconciles the new analysis with stored findings:
 * new keys are inserted as open, reappearing resolved findings reopen,
 * acknowledged findings stay acknowledged, vanished findings auto-resolve.
 * Returns the rows it inserted, first appearances only, which gives leak
 * alerts natural dedup across syncs (later syncs merely bump lastSeenAt).
 */
export const diffFindings = async (
  tenantId: string,
  newFindings: WasteFinding[],
  now: Date,
  activitySignal?: ActivitySignal,
  options?: { database: Db; reconcile?: ActivityReconciliation },
): Promise<InsertedFinding[]> => {
  // One transaction so a mid-loop failure can't leave findings half-diffed
  // (some inserted/reopened, others never resolved) for the tenant.
  return (options?.database ?? db).transaction(async (tx) => {
    const reconcile = options?.reconcile;
    const existing = await tx.query.findings.findMany({
      where: eq(findings.tenantId, tenantId),
    });
    const existingByKey = new Map(existing.map((f) => [f.dedupeKey, f]));
    const newByKey = new Map(newFindings.map((f) => [f.dedupeKey, f]));
    // A finding pseudonymised by the retention job stores the hash of a key
    // that embedded an email address. When that seat shows up again it
    // reopens the same row (and gets its plain key back below) instead of
    // inserting a second one.
    const newByStoredKey = new Map(
      newFindings.map((f) => [pseudonymisedDedupeKey(f.dedupeKey), f]),
    );

    const toInsert = newFindings.filter(
      (f) =>
        !existingByKey.has(f.dedupeKey) &&
        !existingByKey.has(pseudonymisedDedupeKey(f.dedupeKey)),
    );
    const inserted: InsertedFinding[] = [];
    for (const batch of chunk(toInsert, 250)) {
      if (reconcile?.preview) {
        for (const f of batch) {
          reconcile.changes.push({
            id: randomUUID(),
            rule: f.rule,
            graphUserId: f.graphUserId,
            before: null,
            after: { status: "open", resolvedAt: null },
          });
        }
        continue;
      }
      const rows = await tx
        .insert(findings)
        .values(
          batch.map((f) => ({
            tenantId,
            dedupeKey: f.dedupeKey,
            rule: f.rule,
            graphUserId: f.graphUserId,
            skuId: f.skuId,
            title: f.title,
            detail: f.detail,
            monthlyImpactCents: f.monthlyImpactCents,
            status: "open" as const,
            firstSeenAt: now,
            lastSeenAt: now,
          })),
        )
        .returning({
          id: findings.id,
          rule: findings.rule,
          title: findings.title,
          monthlyImpactCents: findings.monthlyImpactCents,
          graphUserId: findings.graphUserId,
        });
      inserted.push(
        ...rows.map(({ id, rule, title, monthlyImpactCents }) => ({
          id,
          rule,
          title,
          monthlyImpactCents,
        })),
      );
      if (reconcile) {
        for (const row of rows) {
          reconcile.changes.push({
            id: row.id,
            rule: row.rule,
            graphUserId: row.graphUserId,
            before: null,
            after: { status: "open", resolvedAt: null },
          });
        }
      }
    }

    for (const f of existing) {
      // A row still holding the plain key takes precedence: the pseudonymised
      // row of the same key then stays as it is, so the plain key is never
      // assigned twice (findings_tenant_dedupe_idx).
      const viaHash = f.dedupeKey.startsWith(PSEUDONYMISED_KEY_PREFIX)
        ? newByStoredKey.get(f.dedupeKey)
        : undefined;
      const fresh =
        newByKey.get(f.dedupeKey) ??
        (viaHash && !existingByKey.has(viaHash.dedupeKey)
          ? viaHash
          : undefined);
      // Carried findings are refreshed without recording an observation.
      const carried =
        activitySignal === "unknown" && INACTIVITY_RULES.includes(f.rule);
      const transition =
        fresh && !carried && f.status === "resolved"
          ? { status: "open" as const, resolvedAt: null }
          : !fresh && f.status !== "resolved"
            ? { status: "resolved" as const, resolvedAt: now }
            : undefined;
      if (reconcile) {
        if (!transition || !reconcile.includes(f) || reconcile.protects(f))
          continue;
        reconcile.changes.push({
          id: f.id,
          rule: f.rule,
          graphUserId: f.graphUserId,
          before: { status: f.status, resolvedAt: f.resolvedAt },
          after: transition,
        });
        if (!reconcile.preview) {
          await tx
            .update(findings)
            .set(transition)
            .where(eq(findings.id, f.id));
        }
        continue;
      }
      if (fresh) {
        await tx
          .update(findings)
          .set({
            dedupeKey: fresh.dedupeKey,
            title: fresh.title,
            detail: fresh.detail,
            graphUserId: fresh.graphUserId,
            monthlyImpactCents: fresh.monthlyImpactCents,
            ...(!carried && { lastSeenAt: now }),
            ...transition,
          })
          .where(eq(findings.id, f.id));
      } else if (transition) {
        await tx.update(findings).set(transition).where(eq(findings.id, f.id));
      }
    }

    return inserted;
  });
};

/**
 * Immediate email when a sync inserts new offboarding-leak findings, the
 * finding class that recurs forever, so it should not wait for the digest.
 * One ledger-tracked message per owner/admin and to the workspace's shared
 * notification address, keyed by the alert's timestamp; addresses the
 * provider reported as permanently failing are skipped.
 * Fully isolated: any failure goes to ops and never affects the sync result.
 */
export const sendLeakAlert = async (
  tenant: typeof tenants.$inferSelect,
  inserted: InsertedFinding[],
  now: Date,
): Promise<void> => {
  try {
    if (!tenant.leakAlerts || tenant.isDemo || !emailEnabled()) return;
    const leaks = pickLeakFindings(inserted);
    if (leaks.length === 0) return;

    const to = await workspaceAdminEmails(tenant.id, "leak");
    if (to.length === 0) return;

    const message = leakAlertMessage(tenant, leaks);
    let failed = 0;
    for (const recipient of to) {
      // A throw here is a ledger error, not a send error; the next recipient
      // still gets a turn.
      const outcome = await deliverOnce(
        {
          tenantId: tenant.id,
          job: "leak",
          periodKey: now.toISOString(),
          recipient,
        },
        () => Promise.resolve(message),
      ).catch(() => "failed" as const);
      if (outcome === "failed") failed++;
    }
    if (failed > 0) {
      throw new OpsSafeError(`${failed} of ${to.length} message(s) not sent`);
    }
  } catch (err) {
    void notifyOps(
      `leak alert failed for workspace ${tenant.id}: ${opsErrorText(err)}`,
      { key: `leakAlert:${tenant.id}`, cooldownMs: 60 * 60 * 1000 },
    );
  }
};
