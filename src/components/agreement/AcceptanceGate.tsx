import { AcceptanceForm } from "~/components/agreement/AcceptanceForm";
import { billingEnabled } from "~/env";
import { buildDpa, DPA_VERSION } from "~/lib/dpa";
import { hasRole, type AccessContext } from "~/server/access";
import { getAcceptance } from "~/server/dpa/records";

/**
 * One-time interstitial above the page content until an owner or admin has
 * accepted the current version of the data processing agreement. Never shown
 * on a self-hosted install (billing off: no processor relationship with us)
 * or for the shared demo workspace. Viewers get one sentence; nothing else
 * changes for anyone, the pages below keep working.
 */
export const AcceptanceGate = async ({ ctx }: { ctx: AccessContext }) => {
  if (!billingEnabled() || ctx.tenant.isDemo || ctx.user.isDemo) return null;
  if (await getAcceptance(ctx.tenant.id)) return null;

  if (!hasRole(ctx, "admin")) {
    return (
      <p
        role="status"
        className="border-line bg-card text-ink-soft mb-6 rounded-2xl border px-5 py-3 text-sm"
      >
        An owner or admin of this workspace still has to accept the data
        processing agreement (version {DPA_VERSION}).
      </p>
    );
  }

  return (
    <section
      aria-labelledby="dpa-gate-heading"
      className="border-brand bg-card shadow-card mb-8 rounded-2xl border px-5 py-5 sm:px-6"
    >
      <p className="text-brand-text text-xs font-medium tracking-[0.14em] uppercase">
        Data protection
      </p>
      <h2 id="dpa-gate-heading" className="font-display mt-1 text-xl">
        Accept the data processing agreement
      </h2>
      <p className="text-ink-soft mt-1 mb-4 max-w-2xl text-sm">
        Every workspace accepts the agreement online once per version. Nothing
        is locked while it is open; it only records who accepted on behalf of
        your company.
      </p>
      <AcceptanceForm
        summary={buildDpa("en").summary}
        idPrefix="dpa-gate"
        defaultLang="en"
      />
    </section>
  );
};
