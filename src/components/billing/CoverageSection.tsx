import { CoverageToggle } from "~/components/billing/CoverageToggle";
import { coverageSummary } from "~/components/billing/billingView";
import { Card, Pill } from "~/components/ui";
import { extraTenantPriceLabel, type BillingInterval } from "~/lib/pricing";
import type {
  CoverageWorkspace,
  MspCoverage,
} from "~/server/billing/mspAccount";

const statusOf = (w: CoverageWorkspace, planRunning: boolean) => {
  if (w.attachedElsewhere) {
    return { tone: "outline", label: "On another MSP account" } as const;
  }
  if (!w.attached) return { tone: "outline", label: "Not attached" } as const;
  if (w.covered) return { tone: "good", label: "Covered" } as const;
  return planRunning
    ? ({ tone: "gold", label: "Beyond your plan" } as const)
    : ({ tone: "outline", label: "Attached" } as const);
};

/**
 * The client workspaces of an MSP account. Attaching is what puts a workspace
 * under the MSP plan; detaching only removes that link, never the workspace.
 */
export const CoverageSection = ({
  coverage,
  interval,
}: {
  coverage: MspCoverage;
  interval: BillingInterval;
}) => {
  const planRunning = coverage.quantity > 0;
  const beyond = coverage.attachedCount - coverage.coveredCount;
  return (
    <Card title="Client tenants">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className="text-ink font-medium">
            {planRunning
              ? coverageSummary(coverage.coveredCount, coverage.quantity)
              : `${coverage.attachedCount} attached`}
          </p>
          <p className="text-ink-soft text-sm">
            Covered workspaces get every MSP feature. The oldest attached
            workspaces are covered first.
          </p>
        </div>

        {planRunning && beyond > 0 && (
          <p
            role="status"
            className="border-gold-soft bg-gold-soft text-gold-text rounded-xl border px-4 py-3 text-sm"
          >
            {beyond === 1
              ? "1 attached workspace is"
              : `${beyond} attached workspaces are`}{" "}
            beyond the {coverage.quantity} your plan covers and{" "}
            {beyond === 1 ? "stays" : "stay"} on Free. Add tenants to your
            subscription ({extraTenantPriceLabel(interval)} each) or detach a
            workspace you no longer need covered.
          </p>
        )}

        <ul className="divide-line border-line divide-y border-t">
          {coverage.workspaces.map((w) => {
            const status = statusOf(w, planRunning);
            const canToggle =
              w.attached || (w.owned && !w.isDemo && !w.attachedElsewhere);
            return (
              <li
                key={w.id}
                className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium break-words">
                    {w.name}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <Pill tone={status.tone}>{status.label}</Pill>
                    {w.isDemo && (
                      <span className="text-ink-faint text-xs">
                        The demo workspace cannot be attached.
                      </span>
                    )}
                    {!w.owned && (
                      <span className="text-ink-faint text-xs">
                        You are no longer an owner of this workspace.
                      </span>
                    )}
                  </div>
                </div>
                {canToggle && (
                  <CoverageToggle
                    tenantId={w.id}
                    workspaceName={w.name}
                    attached={w.attached}
                  />
                )}
              </li>
            );
          })}
        </ul>

        <p className="text-ink-faint text-xs">
          Only workspaces where you hold the owner role can be attached.
          Detaching removes the workspace from your MSP plan and nothing else:
          its data, members and connections stay as they are.
        </p>
      </div>
    </Card>
  );
};
