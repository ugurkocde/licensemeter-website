import { CompareIndexView } from "~/components/compare/CompareIndexView";
import { compareIndexMetadata } from "~/lib/compare/meta";

export const metadata = compareIndexMetadata("en");

export default function ComparePage() {
  return <CompareIndexView lang="en" />;
}
