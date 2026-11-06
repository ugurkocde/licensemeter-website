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
 * Vendor head-to-heads and roundups, rendered from src/lib/compare. The
 * hand-written status-quo pages (powershell-audit and friends) are static
 * folders next to this route and take precedence over it.
 */
export const dynamicParams = false;

export const generateStaticParams = () =>
  templatedCompareSlugs().map((slug) => ({ slug }));

type Props = { params: Promise<{ slug: string }> };

export const generateMetadata = async ({ params }: Props): Promise<Metadata> =>
  compareSlugMetadata("en", (await params).slug) ?? {};

export default async function CompareSlugPage({ params }: Props) {
  const { slug } = await params;
  const r = roundup(slug);
  if (r) return <RoundupView roundup={r} lang="en" />;
  const p = product(slug);
  if (p?.headToHead) return <VendorView product={p} lang="en" />;
  notFound();
}
