import { skuDisplayName } from "~/server/graph/skuCatalog";
import type { findings } from "~/server/db/schema";

type FindingRow = typeof findings.$inferSelect;

/** Allow-list for sku ids before they are interpolated into PowerShell. */
const SKU_ID_PATTERN = /^[0-9a-f-]+$/i;

type LicenseDetail = {
  skuId: string;
  name?: string;
  assignedByGroup?: string | null;
};

type RemediationDetail = {
  upn?: string;
  licenses?: LicenseDetail[];
  aggregate?: boolean;
  unassigned?: number;
  skuPartNumber?: string;
  redundantSkuIds?: string[];
  provider?: string;
};

const RULE_HEADERS: Record<string, string> = {
  disabled_account_with_license: "Disabled accounts still holding licenses",
  never_active: "Licensed users who never became active",
  inactive_90d: "Licensed users inactive for 90+ days",
  copilot_unused: "Unused Copilot seats",
  licensed_guest: "Licensed guest accounts",
  shelfware: "Unassigned paid seats",
  adobe_disabled_in_entra: "Adobe seats held by Entra-disabled users",
  adobe_orphaned: "Adobe seats without an Entra account",
  saas_disabled_in_entra: "Connected app seats held by Entra-disabled users",
  saas_orphaned: "Connected app seats without an Entra account",
  saas_inactive: "Connected app seats inactive past the threshold",
  overlapping_licenses: "Suite + standalone double-pay",
  service_plans_disabled: "Paid suites with disabled service plans",
};

/**
 * Tenant-supplied text on comment lines (titles carry display names, SKU and
 * group names come from vendor data) must never break out of its line: a
 * CR/LF in a crafted name could inject an executable line into a script
 * admins run. Same stripping the UPNs get.
 */
const oneLine = (s: string): string => s.replace(/[\r\n]+/g, " ");

/**
 * Generates a reviewable PowerShell script (Microsoft Graph PowerShell SDK)
 * instead of writing to the tenant: LicenseMeter itself stays read-only.
 */
export const generateRemediationScript = (rows: FindingRow[]): string => {
  const lines: string[] = [
    "# LicenseMeter remediation script (generated)",
    "# Review every line before running. Requires the Microsoft Graph PowerShell SDK",
    "# and a role allowed to manage licenses (e.g. License Administrator).",
    "#",
    "# Connect-MgGraph -Scopes 'User.ReadWrite.All'",
    "",
  ];

  const byRule = new Map<string, FindingRow[]>();
  for (const f of rows) {
    const list = byRule.get(f.rule) ?? [];
    list.push(f);
    byRule.set(f.rule, list);
  }

  for (const [rule, items] of byRule) {
    lines.push(`# ===== ${RULE_HEADERS[rule] ?? rule} =====`);
    for (const f of items) {
      const detail = f.detail as RemediationDetail;

      if (rule === "shelfware") {
        lines.push(
          `# ${oneLine(f.title)}`,
          `#   Reduce the seat count at the next renewal (Microsoft 365 admin center > Billing > Your products,`,
          `#   or through your CSP). SKU: ${f.skuId ? oneLine(skuDisplayName(f.skuId, detail.skuPartNumber)) : "unknown"}.`,
          "",
        );
        continue;
      }

      if (f.rule === "adobe_disabled_in_entra" || f.rule === "adobe_orphaned") {
        lines.push(
          `# ${oneLine(f.title)}`,
          `#   Remove the user in the Adobe Admin Console (adminconsole.adobe.com > Users)`,
          `#   or via your Adobe directory sync. PowerShell cannot manage Adobe seats.`,
          "",
        );
        continue;
      }

      if (f.rule.startsWith("saas_")) {
        const consoles: Record<string, string> = {
          zoom: "Zoom web portal (admin.zoom.us > User Management): downgrade to Basic or remove",
          atlassian:
            "Atlassian admin (admin.atlassian.com > Directory): remove product access",
          salesforce:
            "Salesforce Setup > Users: deactivate or reassign the license",
        };
        const provider =
          typeof detail.provider === "string" ? oneLine(detail.provider) : "";
        lines.push(
          `# ${oneLine(f.title)}`,
          `#   ${consoles[provider] ?? "Remove the seat in the provider's admin console."}`,
          `#   PowerShell cannot manage ${provider || "third-party"} seats.`,
          "",
        );
        continue;
      }

      if (f.rule === "overlapping_licenses" && detail.upn) {
        const upn = oneLine(detail.upn).replaceAll("'", "''");
        const redundant = (detail.redundantSkuIds ?? []).filter((id) =>
          SKU_ID_PATTERN.test(id),
        );
        lines.push(`# ${oneLine(f.title)}`);
        if (redundant.length > 0) {
          lines.push(
            `Set-MgUserLicense -UserId '${upn}' -RemoveLicenses @(${redundant
              .map((id) => `'${id}'`)
              .join(", ")}) -AddLicenses @()`,
          );
        }
        lines.push("");
        continue;
      }

      if (detail.aggregate) {
        lines.push(
          `# ${oneLine(f.title)}`,
          `#   Identities are concealed in usage reports. Enable identifiable names`,
          `#   (Org settings > Reports) and re-sync to get per-user commands.`,
          "",
        );
        continue;
      }

      if (!detail.upn) continue;
      lines.push(`# ${oneLine(f.title)}`);

      // Escape once, use everywhere; strip line breaks so nothing can leave a
      // comment line or split a statement.
      const upn = oneLine(detail.upn).replaceAll("'", "''");

      const licenses: LicenseDetail[] =
        detail.licenses ?? (f.skuId ? [{ skuId: f.skuId }] : []);
      // Sku ids come from stored finding detail; only GUID-shaped values may
      // be interpolated into the generated PowerShell.
      const direct = licenses.filter(
        (l) => !l.assignedByGroup && SKU_ID_PATTERN.test(l.skuId),
      );
      const viaGroup = licenses.filter((l) => l.assignedByGroup);

      if (direct.length > 0) {
        const skuList = direct.map((l) => `'${l.skuId}'`).join(", ");
        lines.push(
          `Set-MgUserLicense -UserId '${upn}' -RemoveLicenses @(${skuList}) -AddLicenses @()`,
        );
      }
      for (const l of viaGroup) {
        lines.push(
          `# ${oneLine(skuDisplayName(l.skuId, l.name))} is inherited from group ${oneLine(l.assignedByGroup ?? "")} -`,
          `#   remove '${upn}' from that group instead of unassigning directly.`,
        );
      }
      lines.push("");
    }
  }

  return lines.join("\n");
};
