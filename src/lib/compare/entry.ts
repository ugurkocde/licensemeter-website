import type { FeatureEntry } from "./types";

/** For a feature we did not look into for this product. Shows as "Not checked". */
export const notReviewed: FeatureEntry = {
  value: "unchecked",
  note: {
    en: "Not part of our review of this product.",
    de: "Nicht Teil unserer Prüfung dieses Produkts.",
  },
};
