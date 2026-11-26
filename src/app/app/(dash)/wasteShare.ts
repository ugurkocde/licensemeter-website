import { MICROSOFT_RULES } from "~/lib/rules";
import type { WasteRuleId } from "~/server/types";

export const wasteShareLabel = (
  monthlySpend: number,
  ruleAgg: readonly { rule: WasteRuleId; cents: number }[],
): string | undefined => {
  if (monthlySpend === 0) return;

  let microsoftWaste = 0;
  let hasOtherConnectorWaste = false;
  for (const { rule, cents } of ruleAgg) {
    if (MICROSOFT_RULES.includes(rule)) {
      microsoftWaste += cents;
    } else if (cents > 0) {
      hasOtherConnectorWaste = true;
    }
  }

  if (microsoftWaste > monthlySpend) {
    return "More than recorded spend";
  }

  const percent = ((microsoftWaste / monthlySpend) * 100).toFixed(1);
  return hasOtherConnectorWaste
    ? `${percent}% of Microsoft spend`
    : `${percent}% of spend`;
};
