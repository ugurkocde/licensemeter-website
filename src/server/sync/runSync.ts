import { and, eq, inArray, lt, notInArray, sql } from "drizzle-orm";

import { db } from "~/server/db";
import {
  adobeToken,
  currentFindingFilter,
  microsoftToken,
  readSourceTokens,
  saasToken,
  type SourceTokens,
  type Tx,
  withSourceLock,
} from "~/server/connectorPurge";
import {
  PSEUDONYMISED_KEY_PREFIX,
  pseudonymisedDedupeKey,
} from "~/server/retention";
import { isUniqueViolation } from "~/server/db/errors";
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
  PremiumLicenseRequiredError,
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
import { mergeAdobeUsers, mergeSaasSeats } from "~/server/sync/mergeByEmail";
import {
  subscriptionTermsBySku,
  type SkuTerms,
} from "~/server/sync/subscriptionTerms";
import { connectorSeatExclusion } from "~/server/sync/connectorExclusions";
import { directoryIdentitiesOf, joinSignals } from "~/server/sync/join";
import type { SyncRunStatus, SyncStep, WasteRuleId } from "~/server/types";
import {
  analyzeWaste,
  paidSeatsOf,
  purchasedSeatsOf,
  spendSeatsOf,
  type WasteFinding,
} from "~/server/waste/engine";

const chunk = <T>(arr: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

/**
 * Per-SKU seats for the daily snapshot: paid seats (trial seats excluded,
 * matching purchasedSeats) and assigned seats. Written on insert and on every
 * same-day rewrite so the two never disagree.
 */
const bySkuOf = (
  skus: readonly {
    skuId: string;
    prepaidEnabled: number;
    consumedUnits: number;
    trialUnits?: number;
  }[],
): Record<string, { purchased: number; assigned: number }> =>
  Object.fromEntries(
    skus.map((s) => [
      s.skuId,
      { purchased: paidSeatsOf(s), assigned: s.consumedUnits },
    ]),
  );

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

export type SyncResult = {
  runId: string;
  status: SyncRunStatus;
  steps: SyncStep[];
};

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
  /** The connection identity the run read; rows are written only while it holds. */
  token: string | undefined,
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
      const written = await withSourceLock(tenantId, async (tx) => {
        if ((await readSourceTokens(tx, tenantId)).saas[provider] !== token)
          return false;
        await tx
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
        return true;
      });
      // Disconnected meanwhile: nothing more is written.
      if (!written) break;
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

  // The identity of each source as this run reads it. Every write of a
  // source's data checks, under the workspace's source lock, that the source
  // is still connected with the same identity; a source disconnected (or
  // reconnected elsewhere) in between is not written (see connectorPurge).
  // Microsoft's token comes from the same tenant row the Graph client is
  // built from (the managed fallback uses tenant.tid), so a disconnect after
  // that read still counts as a change and the run's writes are dropped.
  const msConnAtRead = await db.query.msConnections.findFirst({
    where: eq(msConnections.tenantId, tenantId),
    columns: { mode: true, tid: true, generation: true },
  });
  const readWith: SourceTokens = {
    microsoft: microsoftToken(tenant.tid, msConnAtRead),
    adobe: null,
    saas: {},
  };

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
  await db
    .update(syncRuns)
    .set({ status: "failed", error: "stale run", finishedAt: new Date() })
    .where(
      and(
        eq(syncRuns.tenantId, tenantId),
        eq(syncRuns.status, "running"),
        lt(syncRuns.startedAt, new Date(Date.now() - STALE_RUN_MS)),
      ),
    );

  // Concurrency lock via the partial unique index: only one running sync per
  // tenant. A concurrent caller gets the in-flight run back instead of racing.
  let runId: string;
  try {
    const [run] = await db
      .insert(syncRuns)
      .values({ tenantId, status: "running" })
      .returning({ id: syncRuns.id });
    runId = run!.id;
  } catch (err) {
    // Only a unique violation means "lock held"; anything else (connection
    // loss, FK failure) must surface instead of masquerading as a running sync.
    if (!isUniqueViolation(err)) throw err;
    const inFlight = await db.query.syncRuns.findFirst({
      where: and(
        eq(syncRuns.tenantId, tenantId),
        eq(syncRuns.status, "running"),
      ),
    });
    if (!inFlight) throw err;
    return { runId: inFlight.id, status: "running", steps: [] };
  }

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
      try {
        usageRows = await client.getActiveUserDetail("D90");
        record({
          step: "usageReports",
          status: "ok",
          count: usageRows.length,
          durationMs: since(started),
        });
      } catch (err) {
        record({
          step: "usageReports",
          status: "warning",
          message: errText(err),
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
    readWith.adobe = adobeToken(adobeConn);
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
            .where(
              and(
                eq(adobeConnections.tenantId, tenantId),
                eq(adobeConnections.generation, adobeConn.generation),
              ),
            );
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
            .where(
              and(
                eq(adobeConnections.tenantId, tenantId),
                eq(adobeConnections.generation, adobeConn.generation),
              ),
            );
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
      if (conn) readWith.saas[provider] = saasToken(conn);
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
                eq(saasConnections.generation, conn.generation),
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
            readWith.saas[provider],
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
                eq(saasConnections.generation, conn.generation),
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
    const joined = joinSignals({ graphUsers, usageRows, copilotRows, hasP1 });

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
    // Licenses and users in one locked transaction, written only while
    // Microsoft is still connected as it was when the run read it.
    const microsoftCurrent = await withSourceLock(tenantId, async (tx) => {
      if (
        (await readSourceTokens(tx, tenantId)).microsoft !== readWith.microsoft
      )
        return false;
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

      for (const batch of chunk(joined.users, 250)) {
        await tx
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
        await tx
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
      return true;
    });

    // Persist Adobe users (upsert + prune) when the connector is active and
    // still connected as read.
    if (adobeActive) {
      await withSourceLock(tenantId, async (tx) => {
        if ((await readSourceTokens(tx, tenantId)).adobe !== readWith.adobe)
          return;
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
      await withSourceLock(tenantId, async (tx) => {
        if (
          (await readSourceTokens(tx, tenantId)).saas[provider] !==
          readWith.saas[provider]
        )
          return;
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

    // Price rows for the products a source returned are written under the
    // source lock, and only for sources still connected as read.
    await withSourceLock(tenantId, async (tx) => {
      const current = await readSourceTokens(tx, tenantId);
      const microsoftOk =
        microsoftCurrent && current.microsoft === readWith.microsoft;
      const adobeOk = current.adobe === readWith.adobe;
      // Prefill missing price book rows from the static catalog.
      const existingPrices = await tx.query.priceBook.findMany({
        where: eq(priceBook.tenantId, tenantId),
      });
      const known = new Set(existingPrices.map((p) => p.skuId));
      // Catalog prices added after a row was prefilled: a row still on the
      // catalog's old fallback of 0 picks up the new list price. Only rows the
      // customer never touched (source "default") qualify; any edited price
      // is "custom" and is never overwritten.
      const skuIds = new Set(microsoftOk ? skus.map((s) => s.skuId) : []);
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
        await tx
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
      const missing = microsoftOk
        ? skus.filter((s) => !known.has(s.skuId))
        : [];
      if (missing.length > 0) {
        for (const batch of chunk(missing, 250)) {
          await tx.insert(priceBook).values(
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
      const adobeProducts = adobeOk
        ? [...new Set(adobeRows.flatMap((u) => u.products))]
        : [];
      const missingAdobe = adobeProducts
        .map(adobePriceKey)
        .filter((id) => !known.has(id));
      if (missingAdobe.length > 0) {
        for (const batch of chunk(missingAdobe, 250)) {
          await tx
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
        .filter(
          ([provider]) => current.saas[provider] === readWith.saas[provider],
        )
        .flatMap(([provider, seats]) =>
          [...new Set(seats.flatMap((s) => s.products))].map((p) =>
            saasPriceKey(provider, p),
          ),
        )
        .filter((id) => !known.has(id));
      if (missingSaas.length > 0) {
        for (const batch of chunk(missingSaas, 250)) {
          await tx
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
    });
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
    const newFindings = analyzeWaste({
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

    // Findings of a source disconnected while the run was reading it are
    // dropped under the lock (see connectorPurge).
    const inserted = await diffFindings(tenantId, allFindings, now, {
      keep: (tx) => currentFindingFilter(tx, tenantId, readWith),
    });
    await sendLeakAlert(tenant, inserted, now);

    // --- Snapshot + tenant capabilities ------------------------------------
    // Both derive from the Microsoft read: written under the lock and only
    // while Microsoft is still connected as read.
    const totalMonthlySpendCents = inventory.reduce(
      (sum, s) => sum + spendSeatsOf(s) * (prices[s.skuId] ?? 0),
      0,
    );
    await withSourceLock(tenantId, async (tx) => {
      if (
        !microsoftCurrent ||
        (await readSourceTokens(tx, tenantId)).microsoft !== readWith.microsoft
      )
        return;
      const openRows = await tx.query.findings.findMany({
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
      await tx
        .insert(snapshots)
        .values({
          tenantId,
          day,
          totalMonthlySpendCents,
          totalMonthlyWasteCents,
          purchasedSeats,
          assignedSeats: skus.reduce((s, x) => s + x.consumedUnits, 0),
          bySku: bySkuOf(inventory),
        })
        .onConflictDoUpdate({
          target: [snapshots.tenantId, snapshots.day],
          set: {
            totalMonthlySpendCents,
            totalMonthlyWasteCents,
            purchasedSeats,
            assignedSeats: skus.reduce((s, x) => s + x.consumedUnits, 0),
            bySku: bySkuOf(inventory),
          },
        });

      // Directory capabilities describe the Microsoft connection; a workspace
      // without one keeps its stored values untouched.
      if (client) {
        await tx
          .update(tenants)
          .set({
            hasP1,
            concealedNames: concealmentSetting ?? joined.concealed,
            activitySignal: joined.activitySignal,
            copilotSignal: joined.copilotSignal,
            usageAggregate: joined.usageAggregate ?? null,
            copilotAggregate: joined.copilotAggregate ?? null,
            ...(orgName && !tenant.isDemo ? { name: orgName } : {}),
          })
          .where(eq(tenants.id, tenantId));
      }
    });

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
    // Only the connection this run read: a replacement keeps its own state.
    if (client && !tenant.isDemo && msConnAtRead) {
      await db
        .update(msConnections)
        .set({ lastVerifiedAt: new Date(), lastVerifyError: null })
        .where(
          and(
            eq(msConnections.tenantId, tenantId),
            eq(msConnections.generation, msConnAtRead.generation),
          ),
        );
    }
    return { runId, status, steps };
  } catch (err) {
    const message = errText(err);
    // App-only auth failure (expired/revoked BYO secret or certificate, or
    // managed re-consent needed): record a clean, non-leaking marker on the
    // connection so the dashboard can prompt a re-enter, without crashing the
    // run. The nightly cron catches per-tenant and continues.
    if (!tenant.isDemo && msConnAtRead && isAppAuthError(message)) {
      await db
        .update(msConnections)
        .set({
          lastVerifyError:
            "Microsoft rejected the stored credential (it may be expired or revoked). Re-enter it on the Microsoft connector page.",
        })
        .where(
          and(
            eq(msConnections.tenantId, tenantId),
            eq(msConnections.generation, msConnAtRead.generation),
          ),
        );
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

/**
 * Re-runs the waste analysis from data already in the database, used after
 * price book edits so impact figures update without a Graph round trip.
 * Falls back gracefully when the tenant has never synced.
 */
export const runAnalysis = (tenantId: string): Promise<void> =>
  // Reads and writes under the source lock, so a disconnect is either fully
  // before this analysis (its rows are gone) or fully after it (it deletes
  // the findings written here).
  withSourceLock(tenantId, (tx) => analyzeStored(tx, tenantId));

const analyzeStored = async (tx: Tx, tenantId: string): Promise<void> => {
  const tenant = await tx.query.tenants.findFirst({
    where: eq(tenants.id, tenantId),
  });
  if (!tenant) throw new Error(`Unknown tenant ${tenantId}`);

  const [skuRows, userRows, priceRows, adobeRows, saasSeatRows] =
    await Promise.all([
      tx.query.tenantSkus.findMany({
        where: eq(tenantSkus.tenantId, tenantId),
      }),
      tx.query.tenantUsers.findMany({
        where: eq(tenantUsers.tenantId, tenantId),
      }),
      tx.query.priceBook.findMany({ where: eq(priceBook.tenantId, tenantId) }),
      tx.query.adobeUsers.findMany({
        where: eq(adobeUsersTable.tenantId, tenantId),
      }),
      tx.query.saasSeats.findMany({
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

  const now = new Date();
  const prices = Object.fromEntries(
    priceRows.map((p) => [p.skuId, p.monthlyPriceCents]),
  );

  const newFindings = analyzeWaste({
    users: userRows.map((r) => ({
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
    })),
    skus: skuRows,
    prices,
    now,
    // Prefer the signal recorded by the last sync; the boolean derivation is
    // only a fallback for tenants synced before the column existed. Unknown
    // concealment (null) is treated as concealed: conservative, no false
    // per-user inactivity findings.
    activitySignal:
      tenant.activitySignal ??
      (tenant.hasP1 || tenant.concealedNames === false ? "full" : "none"),
    copilotSignal: tenant.copilotSignal ?? "none",
    usageAggregate: tenant.usageAggregate ?? undefined,
    copilotAggregate: tenant.copilotAggregate ?? undefined,
    inactiveDays: tenant.inactiveDays,
    exclusions: tenant.findingExclusions,
  });

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
    { tx },
  );

  const totalMonthlySpendCents = skuRows.reduce(
    (sum, s) => sum + spendSeatsOf(s) * (prices[s.skuId] ?? 0),
    0,
  );
  const openRows = await tx.query.findings.findMany({
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
  const assignedSeats = skuRows.reduce((s, x) => s + x.consumedUnits, 0);
  await tx
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
};

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
  computed: WasteFinding[],
  now: Date,
  {
    tx: outer,
    keep,
  }: {
    /** Run inside this transaction, which already holds the source lock. */
    tx?: Tx;
    /**
     * Under the lock: which computed findings may still be written; null
     * writes none and leaves the stored findings untouched.
     */
    keep?: (tx: Tx) => Promise<((f: WasteFinding) => boolean) | null>;
  } = {},
): Promise<InsertedFinding[]> => {
  // One transaction so a mid-loop failure can't leave findings half-diffed
  // (some inserted/reopened, others never resolved) for the tenant. It holds
  // the source lock, so findings of a disconnected source are not written
  // back (see connectorPurge).
  const run = async (tx: Tx): Promise<InsertedFinding[]> => {
    const filter = keep ? await keep(tx) : (f: WasteFinding) => Boolean(f);
    if (filter === null) return [];
    const newFindings = computed.filter(filter);
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
        });
      inserted.push(...rows);
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
      if (fresh) {
        await tx
          .update(findings)
          .set({
            dedupeKey: fresh.dedupeKey,
            title: fresh.title,
            detail: fresh.detail,
            graphUserId: fresh.graphUserId,
            monthlyImpactCents: fresh.monthlyImpactCents,
            lastSeenAt: now,
            ...(f.status === "resolved"
              ? { status: "open" as const, resolvedAt: null }
              : {}),
          })
          .where(eq(findings.id, f.id));
      } else if (f.status !== "resolved" && filter(f)) {
        // A finding of a source that failed the check (its credentials were
        // replaced during the run, say) is left as it is: this run did not
        // read that source under its current connection.
        await tx
          .update(findings)
          .set({ status: "resolved", resolvedAt: now })
          .where(eq(findings.id, f.id));
      }
    }

    return inserted;
  };
  return outer ? run(outer) : withSourceLock(tenantId, run);
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
