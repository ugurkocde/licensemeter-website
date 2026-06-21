import { and, eq, inArray, isNotNull, lt, notInArray, sql } from "drizzle-orm";

import { siteUrl } from "~/env";
import { fmtMoney } from "~/lib/format";
import { db } from "~/server/db";
import {
  adobeConnections,
  adobeUsers as adobeUsersTable,
  aiSpendDaily,
  findings,
  memberships,
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
import { decryptSecret } from "~/server/crypto";
import type { AdobeUser, SaasProvider, SaasSeat } from "~/server/types";
import { DemoGraphClient } from "~/server/graph/demoGraph";
import { MsGraphClient } from "~/server/graph/msGraph";
import { skuDefaultPriceCents, skuDisplayName } from "~/server/graph/skuCatalog";
import {
  PremiumLicenseRequiredError,
  type CopilotUsageRow,
  type GraphClient,
  type GraphSubscribedSku,
  type GraphUser,
  type UsageReportRow,
} from "~/server/graph/types";
import { emailEnabled, leakAlertHtml, sendEmail } from "~/server/email";
import { pickLeakFindings } from "~/server/leakAlerts";
import { notifyOps } from "~/server/ops";
import { joinSignals } from "~/server/sync/join";
import type { SyncRunStatus, SyncStep, WasteRuleId } from "~/server/types";
import {
  analyzeWaste,
  purchasedSeatsOf,
  type WasteFinding,
} from "~/server/waste/engine";

const chunk = <T>(arr: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

/**
 * Error text persisted to sync_runs (and therefore visible to workspace
 * members): length-bounded, no stack traces. Full errors go to server logs.
 */
const errText = (err: unknown): string => {
  console.error("[sync]", err);
  const message = err instanceof Error ? err.message : String(err);
  return message.slice(0, 300);
};

export type SyncResult = {
  runId: string;
  status: SyncRunStatus;
  steps: SyncStep[];
};

const dayString = (d: Date): string => d.toISOString().slice(0, 10);

const dayMinus = (day: string, days: number): string =>
  dayString(new Date(Date.parse(`${day}T00:00:00Z`) - days * 24 * 60 * 60 * 1000));

/**
 * Pull daily cost rows for an AI connector and upsert them. The first sync
 * backfills as far as the provider exposes (OpenAI 180 days, Anthropic ~90);
 * later syncs re-pull from seven days before the newest stored day so
 * late-settling costs heal. Failures become a warning step and never disturb
 * the member analysis already collected for the provider.
 */
const syncAiSpend = async (
  tenantId: string,
  provider: "openai" | "anthropic",
  client: AiSpendClient,
  now: Date,
  steps: SyncStep[],
): Promise<void> => {
  const step = `${provider}Spend` as const;
  try {
    const [latest] = await db
      .select({ day: sql<string | null>`max(${aiSpendDaily.day})` })
      .from(aiSpendDaily)
      .where(
        and(
          eq(aiSpendDaily.tenantId, tenantId),
          eq(aiSpendDaily.provider, provider),
        ),
      );
    const sinceDay = latest?.day
      ? dayMinus(latest.day, 7)
      : dayMinus(dayString(now), provider === "openai" ? 180 : 90);
    const rows = await client.getSpend(sinceDay);
    for (const batch of chunk(rows, 250)) {
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
    steps.push({ step, status: "ok", count: rows.length });
  } catch (err) {
    steps.push({ step, status: "warning", message: errText(err) });
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
  { client: clientOverride }: { client?: GraphClient } = {},
): Promise<SyncResult> => {
  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, tenantId),
  });
  if (!tenant) throw new Error(`Unknown tenant ${tenantId}`);

  const client: GraphClient =
    clientOverride ??
    (tenant.isDemo ? new DemoGraphClient() : new MsGraphClient(tenant.tid));

  // Fail runs stuck in "running" (crashed process) so the lock cannot
  // deadlock. Six minutes: every sync path runs under maxDuration 300s, so a
  // running row older than that is dead, and the instant-scan poller should
  // not show "syncing" for longer than this after a hard kill.
  await db
    .update(syncRuns)
    .set({ status: "failed", error: "stale run", finishedAt: new Date() })
    .where(
      and(
        eq(syncRuns.tenantId, tenantId),
        eq(syncRuns.status, "running"),
        lt(syncRuns.startedAt, new Date(Date.now() - 6 * 60 * 1000)),
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
  } catch {
    const inFlight = await db.query.syncRuns.findFirst({
      where: and(eq(syncRuns.tenantId, tenantId), eq(syncRuns.status, "running")),
    });
    return { runId: inFlight?.id ?? "", status: "running", steps: [] };
  }

  const steps: SyncStep[] = [];
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
    const orgName = await client.getOrganizationName();

    let skus: GraphSubscribedSku[] = [];
    try {
      skus = await client.getSubscribedSkus();
      steps.push({ step: "subscribedSkus", status: "ok", count: skus.length });
    } catch (err) {
      steps.push({
        step: "subscribedSkus",
        status: "failed",
        message: errText(err),
      });
      throw err; // critical: nothing useful without SKUs
    }

    let concealmentSetting: boolean | null = null;
    try {
      concealmentSetting = await client.getReportConcealment();
      steps.push({
        step: "reportSettings",
        status: concealmentSetting === null ? "warning" : "ok",
        message:
          concealmentSetting === null
            ? "Could not read /admin/reportSettings"
            : `displayConcealedNames=${concealmentSetting}`,
      });
    } catch {
      steps.push({ step: "reportSettings", status: "warning" });
    }

    let graphUsers: GraphUser[] = [];
    let hasP1 = true;
    try {
      try {
        graphUsers = await client.listUsers({ includeSignInActivity: true });
        steps.push({ step: "signInActivity", status: "ok" });
      } catch (err) {
        if (err instanceof PremiumLicenseRequiredError) {
          hasP1 = false;
          steps.push({
            step: "signInActivity",
            status: "skipped",
            message:
              "Tenant has no Entra ID P1/P2; falling back to usage reports",
          });
          graphUsers = await client.listUsers({ includeSignInActivity: false });
        } else {
          throw err;
        }
      }
      steps.push({ step: "users", status: "ok", count: graphUsers.length });
    } catch (err) {
      steps.push({
        step: "users",
        status: "failed",
        message: errText(err),
      });
      throw err; // critical
    }

    let usageRows: UsageReportRow[] = [];
    try {
      usageRows = await client.getActiveUserDetail("D90");
      steps.push({ step: "usageReports", status: "ok", count: usageRows.length });
    } catch (err) {
      steps.push({
        step: "usageReports",
        status: "warning",
        message: errText(err),
      });
    }

    let copilotRows: CopilotUsageRow[] = [];
    try {
      copilotRows = await client.getCopilotUsage("D90");
      steps.push({ step: "copilotUsage", status: "ok", count: copilotRows.length });
    } catch (err) {
      steps.push({
        step: "copilotUsage",
        status: "warning",
        message: errText(err),
      });
    }

    // --- Adobe: entitlements for offboarding-leak detection ----------------
    let adobeRows: AdobeUser[] = [];
    let adobeActive = false;
    const adobeConn = await db.query.adobeConnections.findFirst({
      where: eq(adobeConnections.tenantId, tenantId),
    });
    if (tenant.isDemo || adobeConn) {
      adobeActive = true;
      try {
        const adobeClient = tenant.isDemo
          ? new DemoAdobeClient()
          : new UmapiClient({
              orgId: adobeConn!.orgId,
              clientId: adobeConn!.clientId,
              clientSecret: decryptSecret(adobeConn!.clientSecretEnc),
            });
        adobeRows = await adobeClient.getUsers();
        steps.push({ step: "adobeUsers", status: "ok", count: adobeRows.length });
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
        steps.push({ step: "adobeUsers", status: "warning", message: errText(err) });
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
      try {
        const saasClient = tenant.isDemo
          ? demoSaasClient(provider)
          : await buildSaasClient(provider, {
              orgRef: conn!.orgRef,
              clientId: conn!.clientId,
              secret: decryptSecret(conn!.secretEnc),
            });
        const seats = await saasClient.getSeats();
        saasRows.set(provider, seats);
        saasPersist.add(provider);
        steps.push({
          step: `${provider}Seats`,
          status: "ok",
          count: seats.length,
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
            steps,
          );
        }
      } catch (err) {
        steps.push({
          step: `${provider}Seats`,
          status: "warning",
          message: errText(err),
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
        steps.push({
          step: `${provider}Seats`,
          status: "ok",
          count: stored.length,
          message: "imported snapshot",
        });
      }
    }

    // --- Join + analyze ---------------------------------------------------
    const joined = joinSignals({ graphUsers, usageRows, copilotRows, hasP1 });

    // --- Persist phase (upsert + prune; no destructive window) -------------
    if (skus.length > 0) {
      await db
        .insert(tenantSkus)
        .values(
          skus.map((s) => ({
            tenantId,
            skuId: s.skuId,
            skuPartNumber: s.skuPartNumber,
            displayName: skuDisplayName(s.skuId, s.skuPartNumber),
            prepaidEnabled: s.prepaidUnits.enabled,
            prepaidSuspended: s.prepaidUnits.suspended,
            prepaidWarning: s.prepaidUnits.warning,
            consumedUnits: s.consumedUnits,
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
            updatedAt: sql`excluded.updated_at`,
          },
        });
    }
    // Prune only when Graph returned data; an empty result keeps the last
    // known inventory instead of wiping it (defensive against odd responses).
    if (skus.length > 0) {
      await db
        .delete(tenantSkus)
        .where(
          and(
            eq(tenantSkus.tenantId, tenantId),
            notInArray(tenantSkus.skuId, skus.map((s) => s.skuId)),
          ),
        );
    }

    for (const batch of chunk(joined.users, 250)) {
      await db
        .insert(tenantUsers)
        .values(
          batch.map((u) => ({
            tenantId,
            graphId: u.graphId,
            upn: u.upn,
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
              joined.users.map((u) => u.graphId),
            ),
          ),
        );
    }

    // Persist Adobe users (upsert + prune) when the connector is active.
    if (adobeActive) {
      if (adobeRows.length > 0) {
        await db
          .insert(adobeUsersTable)
          .values(
            adobeRows.map((u) => ({
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
        await db
          .delete(adobeUsersTable)
          .where(
            and(
              eq(adobeUsersTable.tenantId, tenantId),
              notInArray(
                adobeUsersTable.email,
                adobeRows.map((u) => u.email.toLowerCase()),
              ),
            ),
          );
      } else {
        await db
          .delete(adobeUsersTable)
          .where(eq(adobeUsersTable.tenantId, tenantId));
      }
    }

    // Persist SaaS seats (upsert + prune) for providers that fetched cleanly.
    for (const provider of saasPersist) {
      const seats = saasRows.get(provider) ?? [];
      if (seats.length > 0) {
        await db
          .insert(saasSeatsTable)
          .values(
            seats.map((s) => ({
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
        await db
          .delete(saasSeatsTable)
          .where(
            and(
              eq(saasSeatsTable.tenantId, tenantId),
              eq(saasSeatsTable.provider, provider),
              notInArray(
                saasSeatsTable.email,
                seats.map((s) => s.email.toLowerCase()),
              ),
            ),
          );
      } else {
        await db
          .delete(saasSeatsTable)
          .where(
            and(
              eq(saasSeatsTable.tenantId, tenantId),
              eq(saasSeatsTable.provider, provider),
            ),
          );
      }
    }

    // Prefill missing price book rows from the static catalog.
    const existingPrices = await db.query.priceBook.findMany({
      where: eq(priceBook.tenantId, tenantId),
    });
    const known = new Set(existingPrices.map((p) => p.skuId));
    const missing = skus.filter((s) => !known.has(s.skuId));
    if (missing.length > 0) {
      await db.insert(priceBook).values(
        missing.map((s) => ({
          tenantId,
          skuId: s.skuId,
          monthlyPriceCents: skuDefaultPriceCents(s.skuId),
          source: "default" as const,
        })),
      );
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
      await db
        .insert(priceBook)
        .values(
          missingAdobe.map((id) => ({
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

    // Prefill SaaS connector prices (demo gets plausible list estimates).
    const missingSaas = [...saasRows.entries()]
      .flatMap(([provider, seats]) =>
        [...new Set(seats.flatMap((s) => s.products))].map((p) =>
          saasPriceKey(provider, p),
        ),
      )
      .filter((id) => !known.has(id));
    if (missingSaas.length > 0) {
      await db
        .insert(priceBook)
        .values(
          missingSaas.map((id) => ({
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
    const prices = Object.fromEntries(
      (
        await db.query.priceBook.findMany({
          where: eq(priceBook.tenantId, tenantId),
        })
      ).map((p) => [p.skuId, p.monthlyPriceCents]),
    );

    const newFindings = analyzeWaste({
      users: joined.users,
      skus: skus.map((s) => ({
        skuId: s.skuId,
        skuPartNumber: s.skuPartNumber,
        prepaidEnabled: s.prepaidUnits.enabled,
        consumedUnits: s.consumedUnits,
      })),
      prices,
      now,
      activitySignal: joined.activitySignal,
      copilotSignal: joined.copilotSignal,
      usageAggregate: joined.usageAggregate,
      copilotAggregate: joined.copilotAggregate,
      inactiveDays: tenant.inactiveDays,
    });
    const entraIdentities = joined.users.map((u) => ({
      graphId: u.graphId,
      upn: u.upn,
      displayName: u.displayName,
      accountEnabled: u.accountEnabled,
    }));
    const adobeFindings = analyzeAdobeWaste(adobeRows, entraIdentities, prices);
    const saasFindings = [...saasRows.entries()].flatMap(
      ([provider, seats]) =>
        analyzeSaasWaste(provider, seats, entraIdentities, prices, {
          inactiveDays: tenant.inactiveDays,
          now,
        }),
    );
    const allFindings = newFindings.concat(adobeFindings, saasFindings);
    steps.push({ step: "wasteAnalysis", status: "ok", count: allFindings.length });

    const inserted = await diffFindings(tenantId, allFindings, now);
    await sendLeakAlert(tenant, inserted);

    // --- Snapshot + tenant capabilities ------------------------------------
    const totalMonthlySpendCents = skus.reduce(
      (sum, s) => sum + s.consumedUnits * (prices[s.skuId] ?? 0),
      0,
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
    const purchasedSeats = purchasedSeatsOf(
      skus.map((s) => ({
        skuPartNumber: s.skuPartNumber,
        prepaidEnabled: s.prepaidUnits.enabled,
      })),
    );
    await db
      .insert(snapshots)
      .values({
        tenantId,
        day,
        totalMonthlySpendCents,
        totalMonthlyWasteCents,
        purchasedSeats,
        assignedSeats: skus.reduce((s, x) => s + x.consumedUnits, 0),
        bySku: Object.fromEntries(
          skus.map((s) => [
            s.skuId,
            { purchased: s.prepaidUnits.enabled, assigned: s.consumedUnits },
          ]),
        ),
      })
      .onConflictDoUpdate({
        target: [snapshots.tenantId, snapshots.day],
        set: {
          totalMonthlySpendCents,
          totalMonthlyWasteCents,
          purchasedSeats,
          assignedSeats: skus.reduce((s, x) => s + x.consumedUnits, 0),
        },
      });

    await db
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

    const status: SyncRunStatus = steps.some((s) => s.status === "failed")
      ? "partial"
      : "success";
    await db
      .update(syncRuns)
      .set({ status, steps, finishedAt: new Date() })
      .where(eq(syncRuns.id, runId));
    return { runId, status, steps };
  } catch (err) {
    const message = errText(err);
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
      `sync FAILED for tenant ${tenant.name ?? tenant.tid}: ${message}`,
      { key: `sync:${tenantId}`, cooldownMs: 30 * 60 * 1000 },
    );
    return { runId, status: "failed", steps };
  }
};

/**
 * Re-runs the waste analysis from data already in the database, used after
 * price book edits so impact figures update without a Graph round trip.
 * Falls back gracefully when the tenant has never synced.
 */
export const runAnalysis = async (tenantId: string): Promise<void> => {
  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, tenantId),
  });
  if (!tenant) throw new Error(`Unknown tenant ${tenantId}`);

  const [skuRows, userRows, priceRows, adobeRows, saasSeatRows] =
    await Promise.all([
      db.query.tenantSkus.findMany({ where: eq(tenantSkus.tenantId, tenantId) }),
      db.query.tenantUsers.findMany({ where: eq(tenantUsers.tenantId, tenantId) }),
      db.query.priceBook.findMany({ where: eq(priceBook.tenantId, tenantId) }),
      db.query.adobeUsers.findMany({
        where: eq(adobeUsersTable.tenantId, tenantId),
      }),
      db.query.saasSeats.findMany({
        where: eq(saasSeatsTable.tenantId, tenantId),
      }),
    ]);
  if (skuRows.length === 0 && userRows.length === 0) return;

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
    skus: skuRows.map((s) => ({
      skuId: s.skuId,
      skuPartNumber: s.skuPartNumber,
      prepaidEnabled: s.prepaidEnabled,
      consumedUnits: s.consumedUnits,
    })),
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
  });

  const entraIdentities = userRows.map((r) => ({
    graphId: r.graphId,
    upn: r.upn,
    displayName: r.displayName,
    accountEnabled: r.accountEnabled,
  }));
  const adobeFindings = analyzeAdobeWaste(
    adobeRows.map((r) => ({
      email: r.email,
      status: r.status,
      products: r.products,
    })),
    entraIdentities,
    prices,
  );
  const seatsByProvider = new Map<SaasProvider, SaasSeat[]>();
  for (const r of saasSeatRows) {
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
  );

  const totalMonthlySpendCents = skuRows.reduce(
    (sum, s) => sum + s.consumedUnits * (prices[s.skuId] ?? 0),
    0,
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
  const purchasedSeats = purchasedSeatsOf(skuRows);
  const assignedSeats = skuRows.reduce((s, x) => s + x.consumedUnits, 0);
  await db
    .insert(snapshots)
    .values({
      tenantId,
      day,
      totalMonthlySpendCents,
      totalMonthlyWasteCents,
      purchasedSeats,
      assignedSeats,
      bySku: Object.fromEntries(
        skuRows.map((s) => [
          s.skuId,
          { purchased: s.prepaidEnabled, assigned: s.consumedUnits },
        ]),
      ),
    })
    .onConflictDoUpdate({
      target: [snapshots.tenantId, snapshots.day],
      set: {
        totalMonthlySpendCents,
        totalMonthlyWasteCents,
        purchasedSeats,
        assignedSeats,
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
const diffFindings = async (
  tenantId: string,
  newFindings: WasteFinding[],
  now: Date,
): Promise<InsertedFinding[]> => {
  const existing = await db.query.findings.findMany({
    where: eq(findings.tenantId, tenantId),
  });
  const existingByKey = new Map(existing.map((f) => [f.dedupeKey, f]));
  const newByKey = new Map(newFindings.map((f) => [f.dedupeKey, f]));

  const toInsert = newFindings.filter((f) => !existingByKey.has(f.dedupeKey));
  let inserted: InsertedFinding[] = [];
  if (toInsert.length > 0) {
    inserted = await db
      .insert(findings)
      .values(
        toInsert.map((f) => ({
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
  }

  for (const f of existing) {
    const fresh = newByKey.get(f.dedupeKey);
    if (fresh) {
      await db
        .update(findings)
        .set({
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
    } else if (f.status !== "resolved") {
      await db
        .update(findings)
        .set({ status: "resolved", resolvedAt: now })
        .where(eq(findings.id, f.id));
    }
  }

  return inserted;
};

/**
 * Immediate email when a sync inserts new offboarding-leak findings, the
 * finding class that recurs forever, so it should not wait for the digest.
 * Fully isolated: any failure goes to ops and never affects the sync result.
 */
const sendLeakAlert = async (
  tenant: typeof tenants.$inferSelect,
  inserted: InsertedFinding[],
): Promise<void> => {
  try {
    if (!tenant.leakAlerts || tenant.isDemo || !emailEnabled()) return;
    const leaks = pickLeakFindings(inserted);
    if (leaks.length === 0) return;

    const admins = await db.query.memberships.findMany({
      where: and(
        eq(memberships.tenantId, tenant.id),
        inArray(memberships.role, ["owner", "admin"]),
        isNotNull(memberships.oid),
      ),
    });
    const to = admins.map((m) => m.email).filter(Boolean);
    if (to.length === 0) return;

    const totalCents = leaks.reduce((s, f) => s + f.monthlyImpactCents, 0);
    await sendEmail({
      to,
      subject: `LicenseMeter: ${leaks.length} new offboarding leak${leaks.length === 1 ? "" : "s"} in ${tenant.name ?? "your tenant"} (+${fmtMoney(totalCents, tenant.currency)}/mo)`,
      html: leakAlertHtml({
        tenantName: tenant.name ?? tenant.tid,
        leakCount: leaks.length,
        totalImpact: fmtMoney(totalCents, tenant.currency),
        items: leaks.slice(0, 10).map((f) => ({
          title: f.title,
          impact: fmtMoney(f.monthlyImpactCents, tenant.currency),
        })),
        appUrl: siteUrl(),
      }),
    });
  } catch (err) {
    void notifyOps(
      `leak alert failed for tenant ${tenant.name ?? tenant.tid}: ${err instanceof Error ? err.message : String(err)}`,
      { key: `leakAlert:${tenant.id}`, cooldownMs: 60 * 60 * 1000 },
    );
  }
};
