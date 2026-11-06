import type { FeatureEntry } from "./types";

/** For a feature we did not look into for this product. Shows as "Not stated". */
export const notReviewed: FeatureEntry = {
  value: "unknown",
  note: {
    en: "Not part of our review of this product.",
    de: "Nicht Teil unserer Prüfung dieses Produkts.",
  },
};
