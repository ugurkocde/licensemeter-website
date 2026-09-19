"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState, useTransition } from "react";

import {
  clearBrandingAction,
  saveBrandingAction,
  type BrandingActionResult,
} from "~/app/app/(dash)/branding/actions";
import { ReportHeaderPreview } from "~/components/branding/ReportHeaderPreview";
import { Button } from "~/components/ui";
import {
  BRAND_COLOR_PATTERN,
  BRAND_NAME_MAX,
  DEFAULT_ACCENT,
  LOGO_MAX_BYTES,
  LOGO_MEDIA_TYPES,
  TEXT_ON_DARK,
  brandBand,
  contrastRatio,
  type ReportBranding,
} from "~/server/report/brandStyle";

const INPUT =
  "border-line bg-card focus:border-ink min-h-11 w-full rounded-lg border px-3 py-2 text-sm";

const readAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("read failed"));
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsDataURL(file);
  });

/**
 * Branding editor for the owner of the MSP account. The file is checked here
 * for type and size before it is sent; the server checks it again, including
 * the image bytes, and is the one that decides.
 */
export const BrandingForm = ({
  initial,
  workspaceName,
}: {
  initial: ReportBranding;
  workspaceName: string;
}) => {
  const [name, setName] = useState(initial.name ?? "");
  const [color, setColor] = useState(initial.color ?? DEFAULT_ACCENT);
  const [logo, setLogo] = useState(initial.logo);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [result, setResult] = useState<BrandingActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);
  // Reads finish out of order when a user picks two files quickly; only the
  // latest pick may become the logo.
  const logoPick = useRef(0);
  const router = useRouter();
  const ids = { name: useId(), hex: useId(), logo: useId(), logoHelp: useId() };

  const colorValid = BRAND_COLOR_PATTERN.test(color);
  const band = brandBand(colorValid ? color : null);
  const hasStored = Boolean(initial.name ?? initial.logo ?? initial.color);

  const run = (action: () => Promise<BrandingActionResult>) => {
    setResult(null);
    startTransition(async () => {
      const res = await action();
      setResult(res);
      if (res.ok) router.refresh();
    });
  };

  const pickLogo = async (file: File | undefined) => {
    const pick = ++logoPick.current;
    setLogoError(null);
    if (!file) return;
    if (!(LOGO_MEDIA_TYPES as readonly string[]).includes(file.type)) {
      setLogoError("Upload a PNG or JPEG file. SVG is not accepted.");
      return;
    }
    if (file.size > LOGO_MAX_BYTES) {
      setLogoError(`The logo must be at most ${LOGO_MAX_BYTES / 1024} KB.`);
      return;
    }
    try {
      const dataUrl = await readAsDataUrl(file);
      if (pick === logoPick.current) setLogo(dataUrl);
    } catch {
      if (pick === logoPick.current)
        setLogoError("The file could not be read.");
    }
  };

  return (
    <form
      className="grid gap-6 lg:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => saveBrandingAction({ name, color, logo }));
      }}
    >
      <div className="flex flex-col gap-5">
        <div>
          <label htmlFor={ids.name} className="text-sm font-medium">
            Brand name
          </label>
          <input
            id={ids.name}
            name="brandName"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={BRAND_NAME_MAX}
            autoComplete="organization"
            className={`${INPUT} mt-1.5`}
          />
        </div>

        <div>
          <label htmlFor={ids.hex} className="text-sm font-medium">
            Brand colour
          </label>
          <div className="mt-1.5 flex items-center gap-2">
            <input
              type="color"
              aria-label="Pick the brand colour"
              value={colorValid ? color.toLowerCase() : DEFAULT_ACCENT}
              onChange={(e) => setColor(e.target.value)}
              className="border-line bg-card size-11 shrink-0 cursor-pointer rounded-lg border p-1"
            />
            <input
              id={ids.hex}
              name="brandColor"
              value={color}
              onChange={(e) => setColor(e.target.value.trim())}
              pattern="#[0-9a-fA-F]{6}"
              maxLength={7}
              spellCheck={false}
              autoComplete="off"
              aria-invalid={!colorValid || undefined}
              className={`${INPUT} font-mono`}
            />
          </div>
          <p
            className={`mt-1.5 text-xs ${colorValid ? "text-ink-faint" : "text-danger-text"}`}
          >
            {colorValid
              ? `Text on the band: ${band.text === TEXT_ON_DARK ? "white" : "dark"}, contrast ${contrastRatio(band.text, band.background).toFixed(1)} to 1.`
              : "Use a colour in the form #RRGGBB."}
          </p>
        </div>

        <div>
          <label htmlFor={ids.logo} className="text-sm font-medium">
            Logo
          </label>
          <input
            ref={fileInput}
            id={ids.logo}
            type="file"
            accept={LOGO_MEDIA_TYPES.join(",")}
            aria-describedby={ids.logoHelp}
            onChange={(e) => void pickLogo(e.target.files?.[0])}
            className="text-ink-soft file:border-line-strong file:bg-card file:text-ink mt-1.5 block w-full text-sm file:mr-3 file:min-h-11 file:cursor-pointer file:rounded-xl file:border file:border-solid file:px-4 file:text-sm file:font-medium"
          />
          <p id={ids.logoHelp} className="text-ink-faint mt-1.5 text-xs">
            PNG or JPEG, at most {LOGO_MAX_BYTES / 1024} KB. A wide logo on a
            transparent or white background works best. Without a logo the
            report shows the brand name.
          </p>
          {logo && (
            <Button
              type="button"
              variant="micro"
              className="mt-2"
              onClick={() => {
                setLogo(null);
                setLogoError(null);
                if (fileInput.current) fileInput.current.value = "";
              }}
            >
              Remove logo
            </Button>
          )}
          <p role="alert" className="text-danger-text mt-1.5 text-xs">
            {logoError}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <ReportHeaderPreview
          branding={{ name, color: colorValid ? color : null, logo }}
          workspaceName={workspaceName}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="submit"
            variant="primary"
            disabled={pending || !colorValid || name.trim().length === 0}
          >
            {pending ? "Saving" : "Save branding"}
          </Button>
          {hasStored && (
            <Button
              type="button"
              disabled={pending}
              onClick={() =>
                run(async () => {
                  const res = await clearBrandingAction();
                  if (res.ok) {
                    setName("");
                    setColor(DEFAULT_ACCENT);
                    setLogo(null);
                    if (fileInput.current) fileInput.current.value = "";
                  }
                  return res;
                })
              }
            >
              Reset to LicenseMeter branding
            </Button>
          )}
        </div>
        <p
          role="status"
          aria-live="polite"
          className={
            result
              ? `text-sm ${result.ok ? "text-moss" : "text-danger-text"}`
              : "sr-only"
          }
        >
          {result &&
            (result.ok ? "Saved." : (result.error ?? "Could not save."))}
        </p>
      </div>
    </form>
  );
};
