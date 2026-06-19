"use client";

import { useRef, useState, useTransition } from "react";

import { buttonClass } from "~/components/ui";
import { captureEmail } from "~/server/actions";

export const EmailCapture = ({
  statusTone = "light",
}: {
  statusTone?: "light" | "dark";
}) => {
  const [state, setState] = useState<"idle" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const doneClass =
    statusTone === "dark" ? "text-sm text-moss-soft" : "text-sm text-moss";
  const errorClass =
    statusTone === "dark"
      ? "w-full text-xs text-rust-bright"
      : "w-full text-xs text-rust-text";

  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(async () => {
          const result = await captureEmail(data);
          if (result.ok) {
            setState("done");
            setMessage(
              "Sent. The guide and the security one-pager are on their way to your inbox.",
            );
            // The fields hide on success: park focus on the confirmation
            // before the commit so it is never dropped to <body>.
            statusRef.current?.focus();
          } else {
            setState("error");
            setMessage(
              result.error ?? "Something went wrong. Please try again.",
            );
            inputRef.current?.focus();
          }
        });
      }}
    >
      {/* Honeypot: hidden from humans, irresistible to bots. */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="hidden"
      />
      <input
        ref={inputRef}
        type="email"
        name="email"
        required
        placeholder="you@yourcompany.com"
        aria-label="Email address"
        aria-invalid={state === "error" || undefined}
        autoComplete="email"
        spellCheck={false}
        className={`border-line bg-card text-ink placeholder:text-ink-faint focus:border-ink min-h-11 min-w-56 flex-1 border px-3 py-2.5 text-sm ${
          state === "done" ? "hidden" : ""
        }`}
      />
      <button
        disabled={pending}
        className={buttonClass("secondary", state === "done" ? "hidden" : "")}
      >
        {pending ? "Sending…" : "Send me the guide"}
      </button>
      {/* Live region mounted from first render so announcements are reliable. */}
      <p
        ref={statusRef}
        tabIndex={-1}
        role="status"
        aria-live="polite"
        className={
          state === "done"
            ? doneClass
            : state === "error"
              ? errorClass
              : "sr-only"
        }
      >
        {message}
      </p>
    </form>
  );
};
