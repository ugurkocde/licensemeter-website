import { NextResponse, type NextRequest } from "next/server";

import { requireCronAuth } from "~/server/cronAuth";
import { notifyOps } from "~/server/ops";
import { opsErrorText } from "~/server/opsError";
import { runRetention } from "~/server/retention";
import { migrateLegacySecrets } from "~/server/secretMigration";
import { ReencryptionAborted } from "~/server/secretReencryption";

export const maxDuration = 300;

/**
 * Daily data-minimisation run, protected by CRON_SECRET. Deletes stale
 * sign-in tracking and expired rate-limit rows and pseudonymises old resolved
 * findings (periods in src/lib/retention.ts). It also re-encrypts connector
 * secrets still on the AUTH_SECRET-derived key (src/server/secretMigration.ts).
 * Responds with counts only.
 */
export const GET = async (req: NextRequest) => {
  const denied = requireCronAuth(req);
  if (denied) return denied;
  try {
    const result = await runRetention();
    console.log("[retention]", JSON.stringify(result));
    const secrets = await migrateSecrets();
    return NextResponse.json(
      { ...result, secrets },
      { status: "error" in secrets ? 500 : 200 },
    );
  } catch (err) {
    void notifyOps("retention run failed; see the function log", {
      key: "cron:retention",
      cooldownMs: 24 * 60 * 60 * 1000,
    });
    console.error("[retention] failed", err);
    return NextResponse.json({ error: "retention failed" }, { status: 500 });
  }
};

/** The secret step fails on its own, so retention still reports its counts. */
const migrateSecrets = async () => {
  try {
    const result = await migrateLegacySecrets();
    console.log("[retention] secrets", JSON.stringify(result));
    return result;
  } catch (err) {
    void notifyOps("secret re-encryption failed; see the function log", {
      key: "cron:retention:secrets",
      cooldownMs: 24 * 60 * 60 * 1000,
    });
    console.error(
      "[retention] secret re-encryption failed",
      err instanceof ReencryptionAborted ? err.message : opsErrorText(err),
    );
    return { error: "secret re-encryption failed" } as const;
  }
};
