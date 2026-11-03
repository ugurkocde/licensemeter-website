"use client";

import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { SyncProgress } from "~/components/workspace/SyncProgress";
import { finishedReadOutcome, isFollowedRun } from "~/lib/syncStatusRun";
import { triggerSync } from "~/server/actions";
import type { SyncRunStatus, SyncStep } from "~/server/types";

/** One run as GET /api/sync returns it. */
type Run = {
  id: string;
  status: SyncRunStatus;
  startedAt: string;
  finishedAt: string | null;
  steps: SyncStep[];
  error: string | null;
};

type Tone = "good" | "warning" | "danger" | "info";

type View =
  | { kind: "idle" }
  | { kind: "running"; since: number; steps: SyncStep[] }
  | { kind: "message"; tone: Tone; text: string; detail?: string | null };

type SyncStatus = { view: View; start: () => void; dismiss: () => void };

const POLL_INTERVAL_MS = 2500;
/* A healthy run ends well within 10 minutes (the request deadline caps it).
   Past this a run row that never finished, such as a killed process, would
   otherwise keep the page polling until the stale-run reaper clears it. */
const MAX_WATCH_MS = 12 * 60 * 1000;
/* Clock tolerance when telling the run Sync now started from an older one. */
const START_SLACK_MS = 5000;
const CONFIRMATION_MS = 8000;
/* Above the Date header's one-second resolution. */
const CLOCK_JITTER_MS = 1500;

/**
 * Latest run plus the server clock offset taken from the Date header, so a
 * server timestamp converts to local time. Undefined means the read failed,
 * which is transient: the caller keeps polling.
 */
const fetchLatestRun = async (): Promise<
  { run: Run | null; offsetMs: number } | undefined
> => {
  try {
    const res = await fetch("/api/sync", { cache: "no-store" });
    if (!res.ok) return undefined;
    const body = (await res.json()) as { run: Run | null };
    const serverNow = Date.parse(res.headers.get("date") ?? "");
    return {
      run: body.run,
      offsetMs: Number.isNaN(serverNow) ? 0 : serverNow - Date.now(),
    };
  } catch {
    return undefined;
  }
};

const plural = (n: number, one: string, many: string) =>
  `${n.toLocaleString("en-GB")} ${n === 1 ? one : many}`;

/** The confirmation for a finished run, from its own steps (no extra query). */
const finishedView = (run: Run): View => {
  if (run.status === "failed") {
    return {
      kind: "message",
      tone: "danger",
      text: "The sync failed.",
      detail: run.error,
    };
  }
  if (run.status === "partial") {
    const failed = run.steps.filter((s) => s.status === "failed").length;
    return {
      kind: "message",
      tone: "warning",
      text: "Synced just now, with warnings.",
      detail: `${plural(failed, "step", "steps")} could not finish. The figures use the data that did sync.`,
    };
  }
  // No count here: the analysis step counts every detected finding, including
  // dismissed and snoozed ones, so it could contradict the open findings card.
  return {
    kind: "message",
    tone: "good",
    text: "Synced just now.",
    detail: "Figures and findings are up to date.",
  };
};

const SyncStatusContext = createContext<SyncStatus | null>(null);

export const useSyncStatus = (): SyncStatus => {
  const ctx = useContext(SyncStatusContext);
  if (!ctx) throw new Error("useSyncStatus needs a SyncStatusProvider");
  return ctx;
};

/**
 * Shared sync state for one page section: the header line, the Sync now
 * button and the status panel below the header read it. It watches a run
 * already in progress when the page loads (nightly cron, or a sync started
 * before navigating here) and every run started with Sync now: it polls
 * GET /api/sync while a run is going, refreshes the page when it ends and
 * shows a short confirmation, failure or refusal. Nothing polls while idle,
 * and nothing updates state or refreshes after unmount.
 */
export const SyncStatusProvider = ({
  initialRun,
  children,
}: {
  /** The latest run as the server rendered the page. */
  initialRun: { id: string; status: SyncRunStatus; startedAt: string } | null;
  children: ReactNode;
}) => {
  const router = useRouter();
  const initiallyRunning = initialRun?.status === "running";
  const [view, setView] = useState<View>(() =>
    initialRun?.status === "running"
      ? { kind: "running", since: Date.parse(initialRun.startedAt), steps: [] }
      : { kind: "idle" },
  );

  const mounted = useRef(true);
  /** True from start until finish; guards against finishing twice. */
  const active = useRef(initiallyRunning);
  /** The Sync now action is still in flight. */
  const actionPending = useRef(false);
  /** Null while watching any run; for Sync now, the run that was latest
   * before the click, which must not count as the one that finished. */
  const baseline = useRef<{ id: string | null; after: number } | null>(null);
  /** Shown when the action failed and no new run appeared (a refusal). */
  const refusal = useRef<{ tone: Tone; text: string } | null>(null);
  /** Watched runs report the elapsed time from their server start time. */
  const sinceFromServer = useRef(initiallyRunning);
  const latestId = useRef(initialRun?.id ?? null);
  /** Bumped by every new watch (a Sync now click or a run found on refresh),
   * so a status read started for an earlier watch is dropped on arrival. */
  const generation = useRef(0);
  /** A run seen running while following, or the one Sync now attached to:
   * its result is shown whenever it started. */
  const watchedId = useRef<string | null>(
    initiallyRunning ? (initialRun?.id ?? null) : null,
  );

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const finish = useCallback(
    (next: View, refresh: boolean) => {
      if (!active.current || !mounted.current) return;
      active.current = false;
      if (refresh) router.refresh();
      setView(next);
    },
    [router],
  );

  /**
   * Applies one status read of the current watch (stale reads are dropped by
   * generation before they get here). What a finished read means is decided
   * by `finishedReadOutcome`; see there.
   */
  const handle = useCallback(
    (latest: Awaited<ReturnType<typeof fetchLatestRun>>) => {
      if (!latest || !active.current || !mounted.current) return;
      const { run, offsetMs } = latest;
      if (run?.status === "running") {
        latestId.current = run.id;
        watchedId.current = run.id;
        // The Date header has whole-second precision, so each poll's offset
        // differs by up to a second: adopt the server start only when it
        // corrects real clock skew, or the clock would jump back and forth.
        const serverSince = Date.parse(run.startedAt) - offsetMs;
        setView((v) =>
          v.kind === "running"
            ? {
                kind: "running",
                steps: run.steps,
                since:
                  sinceFromServer.current &&
                  Math.abs(serverSince - v.since) > CLOCK_JITTER_MS
                    ? serverSince
                    : v.since,
              }
            : v,
        );
        return;
      }
      const outcome = finishedReadOutcome({
        followed:
          run !== null &&
          isFollowedRun(run, {
            watchedId: watchedId.current,
            baseline: baseline.current,
            offsetMs,
          }),
        actionPending: actionPending.current,
        clickWatch: baseline.current !== null,
        watching: watchedId.current !== null,
      });
      if (outcome === "run" && run !== null) {
        latestId.current = run.id;
        finish(finishedView(run), true);
      } else if (outcome === "fallback") {
        if (refusal.current) {
          finish({ kind: "message", ...refusal.current }, false);
        } else {
          finish({ kind: "idle" }, true);
        }
      }
    },
    [finish],
  );

  /* Poll while running, one request at a time. The effect restarts only when
     running flips, not on every step update. */
  const running = view.kind === "running";
  useEffect(() => {
    if (!running) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const watchStarted = Date.now();
    const tick = async () => {
      const gen = generation.current;
      const latest = await fetchLatestRun();
      if (stopped) return;
      if (gen === generation.current) handle(latest);
      if (!active.current) return;
      if (!actionPending.current && Date.now() - watchStarted > MAX_WATCH_MS) {
        finish(
          {
            kind: "message",
            tone: "info",
            text: "This sync is taking longer than usual.",
            detail: "Its progress is in the sync history.",
          },
          false,
        );
        return;
      }
      timer = setTimeout(() => void tick(), POLL_INTERVAL_MS);
    };
    void tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [running, handle, finish]);

  /* A refresh can bring a run that started after this page loaded. */
  const initialId = initialRun?.id ?? null;
  const initialStatus = initialRun?.status;
  const initialStartedAt = initialRun?.startedAt;
  useEffect(() => {
    if (active.current || initialId === null) return;
    latestId.current = initialId;
    if (initialStatus !== "running" || !initialStartedAt) return;
    active.current = true;
    generation.current += 1;
    baseline.current = null;
    watchedId.current = initialId;
    refusal.current = null;
    sinceFromServer.current = true;
    setView({
      kind: "running",
      since: Date.parse(initialStartedAt),
      steps: [],
    });
  }, [initialId, initialStatus, initialStartedAt]);

  /* The success confirmation fades on its own; problems stay until dismissed
     or the next sync. */
  const confirmation = view.kind === "message" && view.tone === "good";
  useEffect(() => {
    if (!confirmation) return;
    const id = setTimeout(() => setView({ kind: "idle" }), CONFIRMATION_MS);
    return () => clearTimeout(id);
  }, [confirmation, view]);

  const start = useCallback(() => {
    if (active.current) return;
    active.current = true;
    actionPending.current = true;
    refusal.current = null;
    watchedId.current = null;
    sinceFromServer.current = false;
    const gen = (generation.current += 1);
    const clickedAt = Date.now();
    baseline.current = {
      id: latestId.current,
      after: clickedAt - START_SLACK_MS,
    };
    setView({ kind: "running", since: clickedAt, steps: [] });
    void (async () => {
      let result: Awaited<ReturnType<typeof triggerSync>> | null;
      try {
        result = await triggerSync();
      } catch {
        // Network failure or a server error before a result came back; the
        // run may still be going, so the next status read decides.
        result = null;
      }
      // A later click owns the panel now; this result is stale.
      if (!mounted.current || gen !== generation.current) return;
      actionPending.current = false;
      if (result && !result.ok && !result.runId) {
        // Refused before any run (role, demo workspace): definitive, so no
        // run that happens to be going may stand in for this click's result.
        finish(
          {
            kind: "message",
            tone: "info",
            text: result.error ?? "Could not start the sync.",
          },
          false,
        );
        return;
      }
      if (result?.runId) watchedId.current = result.runId;
      if (!result) {
        // Transport failure: the run may still be going, so the status read
        // decides and this message is only the fallback.
        refusal.current = {
          tone: "danger",
          text: "Could not start the sync. Try again.",
        };
      }
      // If this read fails, the next periodic read applies the same rules.
      const latest = await fetchLatestRun();
      if (gen !== generation.current) return;
      handle(latest);
    })();
  }, [handle, finish]);

  const dismiss = useCallback(() => {
    setView((v) => (v.kind === "message" ? { kind: "idle" } : v));
  }, []);

  return (
    <SyncStatusContext.Provider value={{ view, start, dismiss }}>
      {children}
    </SyncStatusContext.Provider>
  );
};

/** The header line: "Sync running…" while a run is going, else the page's
 * own text (last synced, imported, warnings). */
export const SyncStatusText = ({ children }: { children: ReactNode }) => {
  const { view } = useSyncStatus();
  return <>{view.kind === "running" ? "Sync running…" : children}</>;
};

const TONES: Record<Tone, { box: string; Icon: typeof Info }> = {
  good: {
    box: "border-good/25 bg-good-soft text-good-text",
    Icon: CircleCheck,
  },
  warning: {
    box: "border-gold/25 bg-gold-soft text-gold-text",
    Icon: TriangleAlert,
  },
  danger: {
    box: "border-danger/25 bg-danger-soft text-danger-text",
    Icon: CircleAlert,
  },
  info: { box: "border-line bg-card text-ink", Icon: Info },
};

/**
 * The status slot below a header: the live checklist while a run is going,
 * then the confirmation, failure or refusal. It takes no space while idle;
 * its live region stays mounted so every change is announced once.
 */
export const SyncStatusPanel = ({ className = "" }: { className?: string }) => {
  const { view, dismiss } = useSyncStatus();
  const announcement =
    view.kind === "running"
      ? "Sync running."
      : view.kind === "message"
        ? [view.text, view.detail].filter(Boolean).join(" ")
        : "";
  return (
    <div className={view.kind === "idle" ? "sr-only" : className}>
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
      {view.kind === "running" && (
        <div className="border-line bg-card shadow-card rounded-2xl border px-5 py-4">
          <SyncProgress
            title="Syncing your workspace"
            steps={view.steps}
            since={view.since}
          />
        </div>
      )}
      {view.kind === "message" && (
        <SyncMessage
          tone={view.tone}
          text={view.text}
          detail={view.detail}
          onDismiss={dismiss}
        />
      )}
    </div>
  );
};

const SyncMessage = ({
  tone,
  text,
  detail,
  onDismiss,
}: {
  tone: Tone;
  text: string;
  detail?: string | null;
  onDismiss: () => void;
}) => {
  const { box, Icon } = TONES[tone];
  return (
    <div
      className={`flex items-start gap-3 rounded-xl border py-3 pr-2 pl-4 text-sm ${box}`}
    >
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1 py-px">
        <p className="font-medium">{text}</p>
        {detail && (
          <p className="mt-0.5 line-clamp-3 text-xs break-words opacity-90">
            {detail}
          </p>
        )}
        {tone !== "good" && (
          <Link
            href="/app/settings/sync-history"
            className="hover:text-ink mt-1 -mb-2 inline-flex min-h-8 items-center text-xs font-medium underline underline-offset-4"
          >
            View sync history
          </Link>
        )}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="-my-1.5 inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg opacity-70 transition hover:bg-black/5 hover:opacity-100"
      >
        <X aria-hidden="true" className="size-4" />
      </button>
    </div>
  );
};
