"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Pill } from "~/components/ui";

export interface MeteringAppItem {
  id: string;
  name: string;
  publisher: string;
  programs: string[];
  source: "admin" | "detection" | "catalog" | "none";
  excluded: boolean;
}

const SOURCE: Record<
  MeteringAppItem["source"],
  [string, "brand" | "teal" | "slate" | "waste"]
> = {
  catalog: ["Known app", "brand"],
  detection: ["Intune detection rule", "teal"],
  admin: ["Entered by an admin", "slate"],
  none: ["Program file unknown", "waste"],
};
const PAGE = 25;
const PROGRAM = /^[a-z0-9][a-z0-9 ._+()&-]{0,62}\.exe$/;

/**
 * Every Windows app assigned in Intune is metered by default. Admins can leave
 * an app out or name its program file; both change the generated collector.
 */
export function MeteringApps({
  apps,
  onlyUnknown: startUnknown = false,
}: {
  apps: MeteringAppItem[];
  /** Start with only the apps that still need a program file. */
  onlyUnknown?: boolean;
}) {
  const router = useRouter();
  const [excluded, setExcluded] = useState(
    () => new Set(apps.filter((app) => app.excluded).map((app) => app.id)),
  );
  const [inputs, setInputs] = useState<Record<string, string>>(() =>
    Object.fromEntries(apps.map((app) => [app.id, app.programs.join(", ")])),
  );
  const [query, setQuery] = useState("");
  const [onlyUnknown, setOnlyUnknown] = useState(startUnknown);
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);

  const parse = (value: string) =>
    value
      .split(/[,;\s]+/)
      .map((name) => name.trim().toLowerCase())
      .filter(Boolean);
  const invalid = apps.filter((app) =>
    parse(inputs[app.id] ?? "").some((name) => !PROGRAM.test(name)),
  );
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return apps.filter(
      (app) =>
        (!onlyUnknown || !parse(inputs[app.id] ?? "").length) &&
        (!needle ||
          app.name.toLowerCase().includes(needle) ||
          app.publisher.toLowerCase().includes(needle) ||
          (inputs[app.id] ?? "").includes(needle)),
    );
  }, [apps, inputs, query, onlyUnknown]);
  const pages = Math.max(1, Math.ceil(visible.length / PAGE));
  const current = Math.min(page, pages - 1);

  async function save() {
    setBusy(true);
    setMessage("");
    setError(false);
    const overrides: Record<string, string[]> = {};
    for (const app of apps) {
      const programs = parse(inputs[app.id] ?? "");
      // Keep an admin entry, or record one when the field was changed.
      if (
        programs.length &&
        (app.source === "admin" ||
          programs.join(", ") !== app.programs.join(", "))
      )
        overrides[app.id] = programs;
    }
    try {
      const res = await fetch("/api/metering", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "apps",
          excluded: [...excluded],
          overrides,
        }),
      });
      const result = (await res.json()) as { error?: string };
      if (!res.ok)
        throw new Error(result.error ?? "Could not save the app list.");
      setMessage(
        "Saved. Update the collector in Setup so devices watch the change.",
      );
      router.refresh();
    } catch (err) {
      setError(true);
      setMessage(
        err instanceof Error ? err.message : "Could not save the app list.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3" aria-busy={busy}>
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-48 flex-1 text-sm">
          Search apps
          <input
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(0);
            }}
            className="border-line-input bg-card mt-1 block min-h-11 w-full rounded-lg border px-3"
          />
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={onlyUnknown}
            onChange={(event) => {
              setOnlyUnknown(event.target.checked);
              setPage(0);
            }}
          />
          Only apps without a program file
        </label>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">
            Assigned Windows apps in Intune and the program files metered for
            them
          </caption>
          <thead className="border-line text-ink-faint border-b text-xs">
            <tr>
              <th scope="col" className="px-2 py-2 font-medium">
                Meter
              </th>
              <th scope="col" className="px-2 py-2 font-medium">
                App
              </th>
              <th scope="col" className="px-2 py-2 font-medium">
                Program files
              </th>
              <th scope="col" className="px-2 py-2 font-medium">
                Source
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.slice(current * PAGE, current * PAGE + PAGE).map((app) => {
              const [label, tone] =
                SOURCE[
                  parse(inputs[app.id] ?? "").length ? app.source : "none"
                ];
              return (
                <tr
                  key={app.id}
                  className="border-line border-b last:border-b-0"
                >
                  <td className="px-2 py-2">
                    <input
                      type="checkbox"
                      aria-label={`Meter ${app.name}`}
                      checked={!excluded.has(app.id)}
                      onChange={(event) =>
                        setExcluded((previous) => {
                          const next = new Set(previous);
                          if (event.target.checked) next.delete(app.id);
                          else next.add(app.id);
                          return next;
                        })
                      }
                    />
                  </td>
                  <th scope="row" className="px-2 py-2 font-normal">
                    <span className="block">{app.name}</span>
                    <span className="text-ink-faint block text-xs">
                      {app.publisher}
                    </span>
                  </th>
                  <td className="px-2 py-2">
                    <input
                      aria-label={`Program files for ${app.name}`}
                      value={inputs[app.id] ?? ""}
                      placeholder="example.exe"
                      onChange={(event) =>
                        setInputs((previous) => ({
                          ...previous,
                          [app.id]: event.target.value,
                        }))
                      }
                      className="border-line-input bg-card min-h-10 w-full min-w-40 rounded-lg border px-2 font-mono text-xs"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <Pill tone={tone}>{label}</Pill>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="text-ink-soft flex flex-wrap items-center justify-between gap-3 text-sm">
        <span>
          {visible.length} of {apps.length} apps · {apps.length - excluded.size}{" "}
          metered
        </span>
        {pages > 1 && (
          <span className="flex items-center gap-2">
            <Button
              disabled={current === 0}
              onClick={() => setPage(current - 1)}
            >
              Previous
            </Button>
            Page {current + 1} of {pages}
            <Button
              disabled={current >= pages - 1}
              onClick={() => setPage(current + 1)}
            >
              Next
            </Button>
          </span>
        )}
      </div>
      {invalid.length > 0 && (
        <p className="text-danger-text text-sm">
          Use program file names only, such as <code>acad.exe</code>, without
          paths. Check {invalid[0]!.name}.
        </p>
      )}
      <div>
        <Button
          variant="primary"
          disabled={busy || invalid.length > 0}
          onClick={() => void save()}
        >
          {busy ? "Saving…" : "Save app list"}
        </Button>
      </div>
      <p
        role="status"
        aria-live="polite"
        className={`text-sm ${error ? "text-danger-text" : "text-ink-soft"}`}
      >
        {message}
      </p>
    </div>
  );
}
