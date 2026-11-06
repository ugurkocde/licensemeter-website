import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { RoundupView } from "~/components/compare/RoundupView";
import { VendorView } from "~/components/compare/VendorView";
import { compareSlugMetadata } from "~/lib/compare/meta";
import {
  product,
  roundup,
  templatedCompareSlugs,
} from "~/lib/compare/registry";

/*
 * German edition of /compare/[slug], from the same data files. The
 * status-quo pages exist in English only, so they have no German route.
 */
export const dynamicParams = false;

export const generateStaticParams = () =>
  templatedCompareSlugs().map((slug) => ({ slug }));

type Props = { params: Promise<{ slug: string }> };

export const generateMetadata = async ({ params }: Props): Promise<Metadata> =>
  compareSlugMetadata("de", (await params).slug) ?? {};

export default async function CompareSlugPageDe({ params }: Props) {
  const { slug } = await params;
  const r = roundup(slug);
  if (r) return <RoundupView roundup={r} lang="de" />;
  const p = product(slug);
  if (p?.headToHead) return <VendorView product={p} lang="de" />;
  notFound();
}
