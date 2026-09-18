"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "~/components/ui";

/** Fetches the generated remediation script and copies it to the clipboard. */
export const CopyScriptButton = ({ url }: { url: string }) => {
  const [state, setState] = useState<"idle" | "copied" | "error">("idle");
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (resetTimer.current !== null) clearTimeout(resetTimer.current);
    },
    [],
  );

  return (
    <>
      <Button
        variant="secondary"
        onClick={async () => {
          try {
            const res = await fetch(url);
            if (!res.ok) throw new Error();
            await navigator.clipboard.writeText(await res.text());
            setState("copied");
          } catch {
            setState("error");
          }
          if (resetTimer.current !== null) clearTimeout(resetTimer.current);
          resetTimer.current = setTimeout(() => setState("idle"), 2000);
        }}
      >
        {state === "copied"
          ? "Copied"
          : state === "error"
            ? "Copy failed"
            : "Copy PowerShell"}
      </Button>
      {/* Label changes alone are not announced; mirror them in a live region. */}
      <span role="status" aria-live="polite" className="sr-only">
        {state === "copied"
          ? "Copied to clipboard"
          : state === "error"
            ? "Copy failed"
            : ""}
      </span>
    </>
  );
};
