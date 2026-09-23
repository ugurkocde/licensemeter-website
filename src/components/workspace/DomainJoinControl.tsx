"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import {
  DOMAIN_JOIN_DESCRIPTION,
  DOMAIN_JOIN_LABEL,
  DOMAIN_JOIN_MODES,
} from "~/lib/domainJoin";
import { setDomainJoinMode } from "~/server/actions";
import type { ActionResult } from "~/server/actions";
import type { DomainJoinMode } from "~/server/types";

/**
 * "Who can join" for the Members card. Owners pick one of three options and it
 * saves on change (same optimistic pattern as the other settings toggles);
 * admins see the current choice without controls.
 */
export const DomainJoinControl = ({
  domain,
  tenantConnected,
  initial,
  canEdit,
}: {
  domain: string | null;
  /** Colleagues from a connected Microsoft tenant are matched by tenant id. */
  tenantConnected: boolean;
  initial: DomainJoinMode;
  canEdit: boolean;
}) => {
  const [pending, startTransition] = useTransition();
  const [current, setCurrent] = useState(initial);
  const [lastValue, setLastValue] = useState(initial);
  const [result, setResult] = useState<ActionResult | null>(null);
  const inFlight = useRef(false);
  const router = useRouter();

  /* Re-sync if the server-confirmed value changes underneath us. */
  if (lastValue !== initial) {
    setLastValue(initial);
    setCurrent(initial);
  }

  const choose = (next: DomainJoinMode) => {
    /* One mutation at a time. */
    if (inFlight.current || next === current) return;
    inFlight.current = true;
    setCurrent(next);
    setResult(null);
    startTransition(async () => {
      try {
        const res = await setDomainJoinMode(next);
        setResult(res);
        if (!res.ok) {
          setCurrent(initial);
          return;
        }
        router.refresh();
      } finally {
        inFlight.current = false;
      }
    });
  };

  return (
    <div className="border-line mt-4 border-t pt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h3 className="text-sm font-medium">Who can join</h3>
        <span
          role="status"
          aria-live="polite"
          className={
            result
              ? `text-xs ${result.ok ? "text-moss" : "text-danger-text"}`
              : "sr-only"
          }
        >
          {result === null
            ? null
            : result.ok
              ? "Saved."
              : (result.error ?? "Save failed")}
        </span>
      </div>
      <p className="text-ink-faint mt-0.5 text-xs break-words">
        Applies to people signing in
        {tenantConnected && " from your Microsoft tenant"}
        {tenantConnected && domain && " or"}
        {domain && ` with a verified @${domain} email`}.
      </p>

      {canEdit ? (
        <fieldset
          className={`mt-2 flex flex-col ${pending ? "opacity-60" : ""}`}
          aria-busy={pending || undefined}
        >
          <legend className="sr-only">Who can join this workspace</legend>
          {DOMAIN_JOIN_MODES.map((mode) => (
            <label
              key={mode}
              className="flex min-h-11 cursor-pointer items-start gap-2.5 py-1.5 text-sm"
            >
              <input
                type="radio"
                name="domain-join-mode"
                value={mode}
                checked={current === mode}
                onChange={() => choose(mode)}
                className="accent-ink mt-0.5 size-4 shrink-0"
              />
              <span className="min-w-0">
                <span className="font-medium">{DOMAIN_JOIN_LABEL[mode]}</span>
                <span className="text-ink-soft block text-xs">
                  {DOMAIN_JOIN_DESCRIPTION[mode]}
                </span>
              </span>
            </label>
          ))}
          {/* A decided request is final (decideDomainJoin), whatever the mode. */}
          <p className="text-ink-faint mt-1 text-xs">
            Someone who was declined, or removed after joining, only gets back
            in by invitation.
          </p>
        </fieldset>
      ) : (
        <p className="mt-2 text-sm">
          <span className="font-medium">{DOMAIN_JOIN_LABEL[current]}</span>
          <span className="text-ink-soft block text-xs">
            {DOMAIN_JOIN_DESCRIPTION[current]} Only an owner can change this.
          </span>
        </p>
      )}
    </div>
  );
};
