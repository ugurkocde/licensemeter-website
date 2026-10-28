"use client";

import { Check, ChevronsUpDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { InitialsAvatar } from "./InitialsAvatar";
import { switchWorkspace } from "~/server/actions";
import type { WorkspaceSummary } from "~/server/access";

const roleLabel = (role: string) =>
  role.charAt(0).toUpperCase() + role.slice(1);

const optionSubtitle = (w: WorkspaceSummary) =>
  w.isDemo ? "Demo workspace" : `${roleLabel(w.role)} · Workspace`;

/**
 * Workspace header for the sidebar: avatar, name and plan, with a popover
 * listing every workspace the user can open when there is more than one.
 */
export const WorkspaceSwitcher = ({
  workspaces,
  activeId,
  subtitle,
  collapsed = false,
  inFlow = false,
  onNavigate,
}: {
  workspaces: WorkspaceSummary[];
  activeId: string;
  /** Shown under the active workspace name, e.g. "Pro plan". */
  subtitle?: string;
  /** Icon rail: avatar-only button, popover opens to the right. */
  collapsed?: boolean;
  /** Mobile drawer: the list expands in flow instead of floating. */
  inFlow?: boolean;
  onNavigate?: () => void;
}) => {
  const [pending, startTransition] = useTransition();
  const [current, setCurrent] = useState(activeId);
  const [lastActiveId, setLastActiveId] = useState(activeId);
  const [open, setOpen] = useState(false);
  const inFlight = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const router = useRouter();

  /* Re-sync when the server-confirmed workspace changes, e.g. after switching
     from the other instance of this control (desktop rail vs mobile drawer). */
  if (lastActiveId !== activeId) {
    setLastActiveId(activeId);
    setCurrent(activeId);
  }

  const active = workspaces.find((w) => w.id === current) ?? workspaces[0];
  const switchable = workspaces.length > 1;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node))
        setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!active) return null;

  const select = (next: string) => {
    setOpen(false);
    /* The focused option unmounts with the popover; hand focus back to the
       trigger. In the mobile drawer, closing it already restores focus. */
    if (!inFlow) buttonRef.current?.focus();
    onNavigate?.();
    /* One mutation at a time, and none when re-selecting the active workspace. */
    if (inFlight.current || next === current) return;
    inFlight.current = true;
    setCurrent(next);
    startTransition(async () => {
      try {
        const result = await switchWorkspace(next);
        if (!result.ok) {
          setCurrent(activeId);
          return;
        }
        router.refresh();
      } finally {
        inFlight.current = false;
      }
    });
  };

  const focusOption = (index: number) => {
    const clamped = (index + workspaces.length) % workspaces.length;
    optionRefs.current[clamped]?.focus();
  };

  const headerContent = (
    <>
      <InitialsAvatar name={active.name} />
      {!collapsed && (
        <span className="min-w-0 flex-1 text-left">
          <span className="text-ink block truncate text-sm font-semibold">
            {active.name}
          </span>
          <span className="text-sidebar-soft block truncate text-xs">
            {subtitle ?? optionSubtitle(active)}
          </span>
        </span>
      )}
      {switchable && !collapsed && (
        <ChevronsUpDown
          aria-hidden="true"
          className="text-sidebar-soft size-4 shrink-0"
        />
      )}
    </>
  );

  return (
    <div ref={rootRef} className="relative">
      {switchable ? (
        <button
          ref={buttonRef}
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-busy={pending || undefined}
          aria-disabled={pending || undefined}
          aria-label={`Active workspace: ${active.name}. Switch workspace`}
          onClick={() => {
            if (!pending) setOpen((v) => !v);
          }}
          onKeyDown={(e) => {
            if (pending) return;
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              setOpen(true);
              requestAnimationFrame(() =>
                focusOption(workspaces.findIndex((w) => w.id === current)),
              );
            }
          }}
          className={`hover:bg-canvas flex w-full cursor-pointer items-center gap-2.5 rounded-xl p-1.5 transition-colors ${
            collapsed ? "justify-center" : ""
          } ${pending ? "opacity-60" : ""}`}
        >
          {headerContent}
        </button>
      ) : (
        <div
          className={`flex items-center gap-2.5 p-1.5 ${collapsed ? "justify-center" : ""}`}
        >
          {headerContent}
        </div>
      )}

      {switchable && open && (
        <div
          role="listbox"
          aria-label="Workspaces"
          className={`sidebar-pop border-line bg-card shadow-float z-50 rounded-xl border p-1.5 ${
            inFlow
              ? "relative mt-2 w-full"
              : collapsed
                ? "absolute top-0 left-full ml-3 w-72"
                : "absolute top-full left-0 mt-2 w-72 max-w-[calc(100vw-2rem)]"
          }`}
        >
          {workspaces.map((w, i) => {
            const selected = w.id === current;
            return (
              <button
                key={w.id}
                ref={(el) => {
                  optionRefs.current[i] = el;
                }}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => select(w.id)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    focusOption(i + 1);
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    focusOption(i - 1);
                  } else if (e.key === "Home") {
                    e.preventDefault();
                    focusOption(0);
                  } else if (e.key === "End") {
                    e.preventDefault();
                    focusOption(workspaces.length - 1);
                  } else if (e.key === "Tab") {
                    setOpen(false);
                  }
                }}
                className={`flex w-full cursor-pointer items-center gap-2.5 rounded-[10px] p-2 text-left transition-colors ${
                  selected ? "bg-brand-soft" : "hover:bg-canvas"
                }`}
              >
                <InitialsAvatar name={w.name} />
                <span className="min-w-0 flex-1">
                  <span className="text-ink block truncate text-sm font-semibold">
                    {w.name}
                  </span>
                  <span className="text-sidebar-soft block truncate text-xs">
                    {optionSubtitle(w)}
                  </span>
                </span>
                {selected && (
                  <Check
                    aria-hidden="true"
                    className="text-brand-text size-4 shrink-0"
                  />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
