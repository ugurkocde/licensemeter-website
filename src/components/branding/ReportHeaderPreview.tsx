import { brandBand, type ReportBranding } from "~/server/report/brandStyle";

/**
 * The white-label report header as the PDF draws it: logo or brand name on
 * the plain page, then the brand-coloured band with the text colour the
 * report picks for contrast. No hooks, so the read-only page and the form
 * share it.
 */
export const ReportHeaderPreview = ({
  branding,
  workspaceName,
}: {
  branding: ReportBranding;
  workspaceName: string;
}) => {
  const band = brandBand(branding.color);
  const name = branding.name?.trim() ?? "";
  return (
    <figure className="border-line overflow-hidden rounded-xl border bg-[#fbfcfc] p-5">
      <div className="flex items-end justify-between gap-4 pb-3">
        {branding.logo ? (
          // A data URL the visitor just picked or the stored logo: next/image
          // has nothing to optimise here.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={branding.logo}
            alt={name ? `${name} logo` : "Brand logo"}
            className="h-9 max-w-[60%] object-contain object-left"
          />
        ) : (
          <span className="font-serif text-xl text-[#0c1a17]">
            {name || "Your brand"}
          </span>
        )}
        <span className="text-right text-xs text-[#3a4541]">
          {workspaceName}
          <br />
          90-day window
        </span>
      </div>
      <div
        className="flex items-center justify-between gap-4 px-3 py-2 text-sm"
        style={{ backgroundColor: band.background, color: band.text }}
      >
        <span>License waste report</span>
        {name && <span className="text-xs">Prepared by {name}</span>}
      </div>
      <figcaption className="text-ink-faint mt-3 text-xs">
        Header of the PDF report. The text on the band switches between white
        and dark on its own, so it stays readable on any brand colour. The
        footer keeps a small &quot;Generated with LicenseMeter&quot; line.
      </figcaption>
    </figure>
  );
};
