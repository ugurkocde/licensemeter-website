"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { setFindingExclusions } from "~/server/actions";

/**
 * Editor for the workspace's finding exclusions: one glob per line, saved
 * with pending and error feedback like the other settings controls.
 */
export const FindingExclusionsForm = ({
  value,
  matched,
}: {
  value: readonly string[];
  /** Synced accounts the saved patterns match right now; null when unknown. */
  matched: number | null;
}) => {
  const initial = value.join("\n");
  const [text, setText] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  /* Re-sync if the server-confirmed value changes underneath us. */
  useEffect(() => setText(initial), [initial]);

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const data = new FormData();
          data.set("patterns", text);
          const result = await setFindingExclusions(data);
          if (!result.ok) {
            setError(result.error ?? "Could not save");
            return;
          }
          router.refresh();
        });
      }}
    >
      <textarea
        name="patterns"
        rows={4}
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={pending}
        aria-label="Excluded accounts, one pattern per line"
        aria-describedby="finding-exclusions-help"
        placeholder={"svc-*\n*@rooms.contoso.com"}
        spellCheck={false}
        autoComplete="off"
        className="border-line-input bg-card focus:border-ink w-full max-w-md border px-3 py-2 font-mono text-sm"
      />
      <p
        id="finding-exclusions-help"
        className="text-ink-faint max-w-md text-xs"
      >
        One pattern per line, matched against sign-in name or display name.{" "}
        <code>*</code> matches any characters. Matching accounts get no per-user
        findings.
        {matched !== null &&
          ` ${matched} synced ${matched === 1 ? "account matches" : "accounts match"} now.`}
      </p>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || text === initial}
          className="border-ink bg-ink text-canvas hover:bg-ink-soft min-h-11 border px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save exclusions"}
        </button>
        <span
          role="status"
          aria-live="polite"
          className={error ? "text-danger-text text-xs" : "sr-only"}
        >
          {error}
        </span>
      </div>
    </form>
  );
};
