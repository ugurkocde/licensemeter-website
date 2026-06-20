"use client";

import {
  createContext,
  useActionState,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

import { buttonClass } from "~/components/ui";
import type { ActionResult } from "~/server/actions";

type Selection = {
  count: number;
  total: number;
  setAll: (checked: boolean) => void;
};

const SelectionContext = createContext<Selection>({
  count: 0,
  total: 0,
  setAll: () => undefined,
});

const rowCheckboxes = (form: HTMLFormElement | null): HTMLInputElement[] =>
  form
    ? Array.from(form.querySelectorAll<HTMLInputElement>('input[name="id"]'))
    : [];

/**
 * Client shell around the desktop findings table: one form whose bulk action
 * surfaces its ActionResult (the plain server-action form swallowed it), a
 * client-side selection count gating the submit, and shared state for the
 * header select-all checkbox.
 */
export const FindingsBulkForm = ({
  action,
  showBar,
  children,
}: {
  action: (formData: FormData) => Promise<ActionResult>;
  showBar: boolean;
  children: React.ReactNode;
}) => {
  const formRef = useRef<HTMLFormElement>(null);
  const [{ count, total }, setSelection] = useState({ count: 0, total: 0 });
  const [result, formAction, pending] = useActionState(
    async (_prev: ActionResult | null, formData: FormData) => action(formData),
    null,
  );

  const recount = useCallback(() => {
    const boxes = rowCheckboxes(formRef.current);
    setSelection({
      count: boxes.filter((b) => b.checked).length,
      total: boxes.length,
    });
  }, []);

  const setAll = useCallback(
    (checked: boolean) => {
      for (const box of rowCheckboxes(formRef.current)) box.checked = checked;
      recount();
    },
    [recount],
  );

  // Sync on mount and after a bulk update revalidates the rows.
  useEffect(recount, [recount, result]);

  return (
    <SelectionContext.Provider value={{ count, total, setAll }}>
      <form
        ref={formRef}
        action={formAction}
        onChange={recount}
        className="rise rise-3 mt-5 mb-8 hidden md:block"
      >
        {showBar && (
          <div className="mb-2 flex items-center justify-end gap-3">
            <p
              aria-live="polite"
              className={`text-xs ${
                result && !result.ok ? "text-danger-text" : "text-ink-soft"
              }`}
            >
              {result
                ? result.ok
                  ? "Updated."
                  : (result.error ?? "Something went wrong.")
                : ""}
            </p>
            <span className="tnum text-xs text-ink-soft">
              {count} selected
            </span>
            <input type="hidden" name="status" value="acknowledged" />
            <button
              disabled={pending || count === 0}
              className={buttonClass("micro")}
            >
              Acknowledge selected
            </button>
          </div>
        )}
        {children}
      </form>
    </SelectionContext.Provider>
  );
};

/**
 * Label wrapper stretching a ~16px checkbox to a 44px touch target via the
 * same invisible ::after overlay as the micro button tier in ui.tsx, without
 * changing the table density. Clicks anywhere on the overlay toggle the
 * wrapped checkbox.
 */
export const CheckboxHitArea = ({
  children,
}: {
  children: React.ReactNode;
}) => (
  <label className="relative inline-flex cursor-pointer touch-manipulation align-middle after:absolute after:-inset-3.5 after:content-['']">
    {children}
  </label>
);

/** Header checkbox that toggles every row checkbox in the findings table. */
export const SelectAllFindings = () => {
  const { count, total, setAll } = useContext(SelectionContext);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = count > 0 && count < total;
  }, [count, total]);
  return (
    <CheckboxHitArea>
      <input
        ref={ref}
        type="checkbox"
        aria-label="Select all findings"
        checked={total > 0 && count === total}
        onChange={(e) => setAll(e.target.checked)}
      />
    </CheckboxHitArea>
  );
};
