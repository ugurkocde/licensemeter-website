"use client";

import { useState } from "react";

import { Button } from "~/components/ui";

/** A read-only value or snippet with a copy button next to it. */
export const CopyBlock = ({
  label,
  value,
  multiline = false,
}: {
  label: string;
  value: string;
  multiline?: boolean;
}) => {
  const [state, setState] = useState<"idle" | "copied" | "error">("idle");

  return (
    <div className="flex flex-wrap items-start gap-2">
      {multiline ? (
        <pre
          aria-label={label}
          tabIndex={0}
          className="border-line bg-canvas min-w-0 flex-1 overflow-x-auto rounded-lg border px-3 py-2 font-mono text-xs leading-relaxed"
        >
          {value}
        </pre>
      ) : (
        <code
          aria-label={label}
          className="border-line bg-canvas min-w-0 flex-1 rounded-lg border px-3 py-2 font-mono text-xs break-all"
        >
          {value}
        </code>
      )}
      <Button
        variant="micro"
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setState("copied");
          } catch {
            setState("error");
          }
          setTimeout(() => setState("idle"), 2000);
        }}
      >
        {state === "copied"
          ? "Copied"
          : state === "error"
            ? "Copy failed"
            : "Copy"}
      </Button>
      {/* Label changes alone are not announced; mirror them in a live region. */}
      <span role="status" aria-live="polite" className="sr-only">
        {state === "copied"
          ? `${label} copied to clipboard`
          : state === "error"
            ? "Copy failed"
            : ""}
      </span>
    </div>
  );
};
