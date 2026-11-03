"use client";

import { Plus, UserRoundX, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";

import { Button } from "~/components/ui";
import {
  MAX_EXCLUSION_LENGTH,
  MAX_EXCLUSIONS,
  parseExclusions,
} from "~/lib/findingExclusions";
import { setFindingExclusions } from "~/server/actions";

const CHIP =
  "border-line bg-subtle text-ink inline-flex max-w-full items-center rounded-lg border font-mono text-xs";

/** One saved pattern, as shown to viewers who cannot edit. */
export const ExclusionChip = ({ pattern }: { pattern: string }) => (
  <span className={`${CHIP} px-2.5 py-1`}>
    <span className="min-w-0 break-all">{pattern}</span>
  </span>
);

const sameList = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((p, i) => p === b[i]);

/**
 * Editor for the workspace's finding exclusions: patterns are added one at a
 * time (Enter or the Add button, commas split several), removed with their
 * own buttons and saved together, with validation and save feedback inline.
 */
export const FindingExclusionsForm = ({
  value,
  matched,
}: {
  value: readonly string[];
  /** Synced accounts the saved patterns match right now; null when unknown. */
  matched: number | null;
}) => {
  const [patterns, setPatterns] = useState<string[]>([...value]);
  const [draft, setDraft] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const id = useId();
  const helpId = `${id}-help`;
  const errorId = `${id}-error`;
  const dirty = !sameList(patterns, value);

  /* Re-sync if the server-confirmed value changes underneath us. */
  const saved = value.join("\n");
  useEffect(() => setPatterns(saved ? saved.split("\n") : []), [saved]);

  /* After removing a chip, focus the input once it is enabled again. */
  const refocus = useRef(false);
  useEffect(() => {
    if (!refocus.current) return;
    refocus.current = false;
    inputRef.current?.focus();
  }, [patterns]);

  /** Merges the typed text into the list; returns the new list or null. */
  const addDraft = (): string[] | null => {
    if (draft.trim() === "") return patterns;
    const typed = parseExclusions(draft);
    if (typed.ok && typed.patterns.length === 0) {
      // Only separators, nothing to add.
      setDraft("");
      setInputError(null);
      return patterns;
    }
    const parsed = parseExclusions([...patterns, draft].join("\n"));
    if (!parsed.ok) {
      setInputError(parsed.error);
      return null;
    }
    if (parsed.patterns.length === patterns.length) {
      setInputError("That pattern is already in the list");
      return null;
    }
    setPatterns(parsed.patterns);
    setDraft("");
    setInputError(null);
    setResult(null);
    return parsed.patterns;
  };

  const remove = (pattern: string) => {
    setPatterns((list) => list.filter((p) => p !== pattern));
    setResult(null);
    refocus.current = true;
  };

  const save = () => {
    const next = addDraft();
    if (!next) {
      inputRef.current?.focus();
      return;
    }
    setResult(null);
    startTransition(async () => {
      const data = new FormData();
      data.set("patterns", next.join("\n"));
      const res = await setFindingExclusions(data);
      if (!res.ok) {
        setResult({ ok: false, text: res.error ?? "Could not save" });
        return;
      }
      setResult({ ok: true, text: "Saved." });
      router.refresh();
    });
  };

  const atLimit = patterns.length >= MAX_EXCLUSIONS;
  const matchText =
    matched !== null && value.length > 0
      ? `${matched} synced ${matched === 1 ? "account matches" : "accounts match"} now.`
      : null;

  return (
    <form
      className="flex max-w-xl flex-col gap-3"
      aria-busy={pending || undefined}
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <p id={helpId} className="text-ink-soft text-xs leading-relaxed">
        Service, room and shared accounts that should never get per-user
        findings. Each pattern is matched against the sign-in name and display
        name, and <code className="text-ink font-mono">*</code> matches any
        characters.
      </p>

      {patterns.length > 0 ? (
        <ul
          aria-label="Excluded account patterns"
          className="flex flex-wrap gap-2"
        >
          {patterns.map((p) => (
            <li key={p} className={`${CHIP} py-0.5 pr-0.5 pl-2.5`}>
              <span className="min-w-0 break-all">{p}</span>
              <button
                type="button"
                onClick={() => remove(p)}
                disabled={pending}
                aria-label={`Remove ${p}`}
                className="text-ink-faint hover:bg-line hover:text-ink ml-1 inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md transition disabled:opacity-40"
              >
                <X aria-hidden="true" className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="border-line-strong text-ink-soft flex items-center gap-3 rounded-xl border border-dashed px-4 py-3 text-sm">
          <UserRoundX
            aria-hidden="true"
            className="text-ink-faint size-4 shrink-0"
          />
          No exclusions yet. Every licensed account is checked.
        </div>
      )}

      <div className="flex flex-wrap items-start gap-2">
        <label htmlFor={`${id}-input`} className="sr-only">
          New exclusion pattern
        </label>
        <input
          ref={inputRef}
          id={`${id}-input`}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            if (inputError) setInputError(null);
          }}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === "Enter") {
              // Enter adds the pattern; Save stores the whole list.
              e.preventDefault();
              addDraft();
            } else if (e.key === "Escape" && draft) {
              setDraft("");
              setInputError(null);
            }
          }}
          disabled={pending || atLimit}
          maxLength={MAX_EXCLUSION_LENGTH}
          placeholder={
            atLimit ? "Pattern limit reached" : "svc-* or *@rooms.contoso.com"
          }
          spellCheck={false}
          autoComplete="off"
          aria-invalid={inputError ? true : undefined}
          aria-describedby={inputError ? `${errorId} ${helpId}` : helpId}
          className={`bg-card min-h-11 min-w-0 flex-1 basis-0 border px-3 py-2 font-mono text-sm disabled:opacity-60 ${
            inputError
              ? "border-danger focus:border-danger"
              : "border-line-input focus:border-ink"
          }`}
        />
        <Button
          type="button"
          onClick={() => {
            addDraft();
            inputRef.current?.focus();
          }}
          disabled={pending || atLimit || draft.trim() === ""}
          className="px-4 py-2"
        >
          <Plus aria-hidden="true" className="size-4" />
          Add
        </Button>
        <p
          id={errorId}
          role="status"
          aria-live="polite"
          className={inputError ? "text-danger-text w-full text-xs" : "sr-only"}
        >
          {inputError}
        </p>
      </div>

      <div className="border-line flex flex-wrap items-center gap-x-3 gap-y-2 border-t pt-3">
        <Button
          type="submit"
          variant="primary"
          disabled={pending || (!dirty && draft.trim() === "")}
          className="px-4 py-2"
        >
          {pending ? "Saving…" : "Save exclusions"}
        </Button>
        {dirty && !pending && (
          <button
            type="button"
            onClick={() => {
              setPatterns([...value]);
              setDraft("");
              setInputError(null);
              setResult(null);
            }}
            className="text-ink-soft hover:text-ink inline-flex min-h-11 cursor-pointer items-center text-sm font-medium underline-offset-4 hover:underline"
          >
            Discard changes
          </button>
        )}
        <p
          role="status"
          aria-live="polite"
          className={`text-xs ${
            result
              ? result.ok
                ? "text-moss"
                : "text-danger-text"
              : "text-ink-faint"
          }`}
        >
          {result?.ok
            ? // Until the refreshed value arrives the list still reads as dirty.
              ["Saved.", dirty ? null : matchText].filter(Boolean).join(" ")
            : result
              ? result.text
              : dirty
                ? "Unsaved changes. The match count updates after saving."
                : matchText}
        </p>
      </div>
    </form>
  );
};
