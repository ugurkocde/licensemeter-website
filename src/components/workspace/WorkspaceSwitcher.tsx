"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { switchWorkspace } from "~/server/actions";
import type { WorkspaceSummary } from "~/server/access";

/** Shown instead of the static tenant name when the user can open several workspaces. */
export const WorkspaceSwitcher = ({
  workspaces,
  activeId,
}: {
  workspaces: WorkspaceSummary[];
  activeId: string;
}) => {
  const [pending, startTransition] = useTransition();
  const [current, setCurrent] = useState(activeId);
  const [lastActiveId, setLastActiveId] = useState(activeId);
  const inFlight = useRef(false);
  const router = useRouter();

  /* Re-sync when the server-confirmed workspace changes, e.g. after switching
     from the other instance of this control (desktop rail vs mobile drawer). */
  if (lastActiveId !== activeId) {
    setLastActiveId(activeId);
    setCurrent(activeId);
  }

  return (
    <select
      value={current}
      aria-busy={pending || undefined}
      aria-label="Active workspace"
      onChange={(e) => {
        const next = e.target.value;
        /* One mutation at a time, and none when re-selecting the active
           workspace (arrowing through options fires change per step). */
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
      }}
      className={`w-full rounded-none border border-sidebar-line bg-sidebar px-2 py-1 text-sm font-medium text-canvas focus:border-sidebar-soft ${
        pending ? "opacity-60" : ""
      }`}
    >
      {workspaces.map((w) => (
        <option key={w.id} value={w.id}>
          {w.name}
          {w.isDemo ? " (demo)" : ""}
        </option>
      ))}
    </select>
  );
};
