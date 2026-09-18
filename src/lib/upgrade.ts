import type { Feature } from "~/server/entitlement";

/** Where every upgrade prompt and locked feature points. */
export const UPGRADE_PATH = "/app/billing";

export const upgradePath = (feature?: Feature) =>
  feature ? `${UPGRADE_PATH}?feature=${feature}` : UPGRADE_PATH;
