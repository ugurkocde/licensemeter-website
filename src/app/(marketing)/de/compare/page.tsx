import { CompareIndexView } from "~/components/compare/CompareIndexView";
import { compareIndexMetadata } from "~/lib/compare/meta";

export const metadata = compareIndexMetadata("de");

export default function ComparePageDe() {
  return <CompareIndexView lang="de" />;
}
