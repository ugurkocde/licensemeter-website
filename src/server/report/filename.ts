/**
 * Attachment filename for the monthly waste-report PDF. Pure module (no env,
 * no db) so the slug rules stay unit-testable.
 */

/** licensemeter-<kind>-<workspace-slug-or-id>-<yyyy-mm>.pdf */
export const reportFilename = (
  tenant: { name: string | null; id: string },
  now: Date,
  kind = "report",
): string => {
  const slug = (tenant.name ?? "")
    .normalize("NFKD")
    // Strip combining marks so "Mueller" with umlaut slugs to "muller", not "m-ller".
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");
  // UTC month, matching the UTC-pinned day buckets used elsewhere.
  const month = now.toISOString().slice(0, 7);
  return `licensemeter-${kind}-${slug || tenant.id}-${month}.pdf`;
};
