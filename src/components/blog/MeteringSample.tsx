/**
 * A static, illustrative Software Metering report for marketing pages: the
 * pricing spotlight and the launch post. The figures are made up for the
 * picture and say so in the caption; they never come from a customer.
 */

type SampleLang = "en" | "de";

const ROWS: { app: string; installed: number; started: number }[] = [
  { app: "Microsoft Visio", installed: 90, started: 27 },
  { app: "Microsoft Project", installed: 60, started: 12 },
  { app: "Adobe Acrobat Pro", installed: 140, started: 104 },
  { app: "Adobe Photoshop", installed: 70, started: 39 },
  { app: "AutoCAD 2026", installed: 50, started: 23 },
];

const LABELS: Record<
  SampleLang,
  {
    title: string;
    period: string;
    app: string;
    started: string;
    notStarted: string;
    of: (started: number, installed: number) => string;
    caption: string;
  }
> = {
  en: {
    title: "Software Metering",
    period: "Last 60 days",
    app: "App",
    started: "Started",
    notStarted: "Not started",
    of: (started, installed) => `${started} of ${installed}`,
    caption:
      "Illustrative figures, not customer data. Devices are counted where the app is installed.",
  },
  de: {
    title: "Software Metering",
    period: "Letzte 60 Tage",
    app: "App",
    started: "Gestartet",
    notStarted: "Nicht gestartet",
    of: (started, installed) => `${started} von ${installed}`,
    caption:
      "Beispielwerte, keine Kundendaten. Gezählt werden Geräte, auf denen die App installiert ist.",
  },
};

export const MeteringSample = ({
  lang = "en",
  className = "",
}: {
  lang?: SampleLang;
  className?: string;
}) => {
  const t = LABELS[lang];
  return (
    <figure className={className}>
      <div className="border-line bg-card shadow-float overflow-hidden rounded-2xl border">
        <div className="border-line flex items-center justify-between gap-3 border-b px-4 py-3 sm:px-5">
          <span className="text-sm font-semibold tracking-tight">
            {t.title}
          </span>
          <span className="bg-canvas text-ink-soft rounded-full px-2.5 py-1 text-xs font-medium">
            {t.period}
          </span>
        </div>
        <table className="tnum w-full text-left text-sm">
          <thead>
            <tr className="text-ink-faint font-mono text-[11px] tracking-[0.12em] uppercase">
              <th scope="col" className="px-4 pt-3 pb-2 font-normal sm:px-5">
                {t.app}
              </th>
              <th
                scope="col"
                className="px-2 pt-3 pb-2 text-right font-normal whitespace-nowrap"
              >
                {t.started}
              </th>
              <th
                scope="col"
                className="px-4 pt-3 pb-2 text-right font-normal whitespace-nowrap sm:px-5"
              >
                {t.notStarted}
              </th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => {
              const share = Math.round((row.started / row.installed) * 100);
              return (
                <tr key={row.app} className="border-line border-t">
                  <th
                    scope="row"
                    className="px-4 py-3 align-top font-medium sm:px-5"
                  >
                    <span className="block">{row.app}</span>
                    <span
                      aria-hidden="true"
                      className="bg-waste-soft mt-2 block h-1.5 w-full max-w-48 overflow-hidden rounded-full"
                    >
                      <span
                        className="bg-brand block h-full rounded-full"
                        style={{ width: `${share}%` }}
                      />
                    </span>
                  </th>
                  <td className="text-ink-soft px-2 py-3 text-right align-top whitespace-nowrap">
                    {t.of(row.started, row.installed)}
                  </td>
                  <td className="text-waste-text px-4 py-3 text-right align-top font-semibold sm:px-5">
                    {row.installed - row.started}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <figcaption className="text-ink-faint mt-3 text-xs leading-relaxed">
        {t.caption}
      </figcaption>
    </figure>
  );
};
