"use client";

import { Maximize2, Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useReducedMotion } from "./useReducedMotion";
import { VideoLightbox } from "./VideoLightbox";

type Feature = {
  id: string;
  title: string;
  body: string;
  video: string;
  poster: string;
};

const FEATURES: Feature[] = [
  {
    id: "overview",
    title: "See the waste in euros",
    body: "The overview prices every unused seat and tracks spend against waste over time.",
    video: "/videos/feature-overview.mp4",
    poster: "/videos/feature-overview.webp",
  },
  {
    id: "findings",
    title: "Act on findings in bulk",
    body: "Filter by rule, select the seats that leaked, and acknowledge them in one click.",
    video: "/videos/feature-findings.mp4",
    poster: "/videos/feature-findings.webp",
  },
  {
    id: "ai-costs",
    title: "Track AI spend daily",
    body: "OpenAI and Anthropic API costs side by side, shown as billed.",
    video: "/videos/feature-ai-costs.mp4",
    poster: "/videos/feature-ai-costs.webp",
  },
  {
    id: "connectors",
    title: "Connect a tool in minutes",
    body: "Read-only connectors for Microsoft 365, Adobe, Atlassian, Zoom and more.",
    video: "/videos/feature-connectors.mp4",
    poster: "/videos/feature-connectors.webp",
  },
];

/**
 * Landing-page product tour. Desktop: a slim feature rail on the left, a
 * large demo clip on the right; clicking the clip opens it in a lightbox
 * (backdrop or Escape closes). Mobile: a horizontal chip row with the video
 * below it. The active clip and its optimized poster receive no source until
 * the panel nears the viewport. Autoplay is muted, begins only while genuinely
 * visible, reacts to prefers-reduced-motion changes, and pauses offscreen or on
 * a hidden browser tab.
 */
export const FeatureShowcase = () => {
  const [active, setActive] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [mediaReady, setMediaReady] = useState(false);
  const [inView, setInView] = useState(false);
  const reducedMotion = useReducedMotion();
  /* Rotate through the features until the visitor interacts; a manual tab
   * click or opening the lightbox hands over control for good. */
  const [autoAdvance, setAutoAdvance] = useState(true);
  /* Explicit visitor pause of the clip; wins over visibility-driven autoplay. */
  const [paused, setPaused] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLSpanElement>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  /* Fetch neither the poster nor video during the initial page load. Start the
   * request shortly before the panel reaches the viewport, leaving enough time
   * for the lightweight poster to arrive before it is visible. */
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel || mediaReady) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setMediaReady(true);
          observer.disconnect();
        }
      },
      { rootMargin: "320px 0px", threshold: 0.01 },
    );
    observer.observe(panel);
    return () => observer.disconnect();
  }, [mediaReady]);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const observer = new IntersectionObserver(
      ([entry]) => setInView(Boolean(entry?.isIntersecting)),
      { threshold: 0.35 },
    );
    observer.observe(panel);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !mediaReady) return;
    const sync = () => {
      if (inView && document.visibilityState === "visible") {
        if (reducedMotion || paused) video.pause();
        else void video.play().catch(() => undefined);
      } else {
        video.pause();
      }
    };
    document.addEventListener("visibilitychange", sync);
    sync();
    return () => {
      document.removeEventListener("visibilitychange", sync);
    };
  }, [active, inView, mediaReady, paused, reducedMotion]);

  const close = () => {
    setExpanded(false);
    const video = videoRef.current;
    if (video && !reducedMotion && !paused) {
      void video.play().catch(() => undefined);
    }
  };

  const togglePlayback = () => {
    const next = !paused;
    setPaused(next);
    const video = videoRef.current;
    if (!video) return;
    if (next) video.pause();
    else void video.play().catch(() => undefined);
  };

  /* Pausing the rotation also freezes the clip; resuming restarts both. */
  const toggleRotation = () => {
    const next = !autoAdvance;
    setAutoAdvance(next);
    setPaused(!next);
  };

  const open = () => {
    setAutoAdvance(false);
    setMediaReady(true);
    videoRef.current?.pause();
    setExpanded(true);
  };

  const selectFeature = (index: number, stopRotation = true) => {
    if (stopRotation) setAutoAdvance(false);
    setActive(index);
  };

  const moveTabFocus = (index: number) => {
    const next = (index + FEATURES.length) % FEATURES.length;
    selectFeature(next);
    tabRefs.current[next]?.focus();
  };

  /* Drive the progress bar on the active tab from playback time. Direct DOM
   * writes on rAF keep it smooth without re-rendering per frame. */
  useEffect(() => {
    if (!autoAdvance || reducedMotion || !inView || !mediaReady) return;
    let rafId: number;
    const tick = () => {
      const video = videoRef.current;
      const bar = progressRef.current;
      if (
        video &&
        bar &&
        Number.isFinite(video.duration) &&
        video.duration > 0
      ) {
        bar.style.width = `${(video.currentTime / video.duration) * 100}%`;
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [active, autoAdvance, inView, mediaReady, reducedMotion]);

  const feature = FEATURES[active] ?? FEATURES[0]!;

  const videoElement = mediaReady ? (
    <video
      ref={videoRef}
      key={feature.id}
      src={feature.video}
      poster={feature.poster}
      muted
      loop={!autoAdvance || reducedMotion}
      playsInline
      controls={reducedMotion}
      preload="metadata"
      onEnded={
        autoAdvance && !reducedMotion
          ? () => setActive((current) => (current + 1) % FEATURES.length)
          : undefined
      }
      aria-label={`Product demo: ${feature.title}`}
      className="block aspect-video w-full bg-white"
    />
  ) : (
    <span
      aria-hidden="true"
      className="bg-subtle text-ink-faint flex aspect-video w-full items-center justify-center text-sm"
    >
      Product demo
    </span>
  );

  return (
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[280px_1fr] lg:items-center lg:gap-6">
      {/* Mobile: horizontal chip row. Desktop: vertical rail with descriptions. */}
      <div className="flex flex-col gap-2 lg:gap-3">
        <div
          role="tablist"
          aria-label="Product features"
          className="-mx-6 flex [scrollbar-width:none] gap-2 overflow-x-auto px-6 pb-1 lg:mx-0 lg:flex-col lg:gap-3 lg:overflow-visible lg:px-0 lg:pb-0 [&::-webkit-scrollbar]:hidden"
        >
          {FEATURES.map((f, index) => {
            const selected = index === active;
            return (
              <button
                ref={(node) => {
                  tabRefs.current[index] = node;
                }}
                key={f.id}
                id={`feature-tab-${f.id}`}
                role="tab"
                type="button"
                tabIndex={selected ? 0 : -1}
                aria-selected={selected}
                aria-controls="feature-panel"
                onClick={() => selectFeature(index)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowRight" || event.key === "ArrowDown") {
                    event.preventDefault();
                    moveTabFocus(index + 1);
                  } else if (
                    event.key === "ArrowLeft" ||
                    event.key === "ArrowUp"
                  ) {
                    event.preventDefault();
                    moveTabFocus(index - 1);
                  } else if (event.key === "Home") {
                    event.preventDefault();
                    moveTabFocus(0);
                  } else if (event.key === "End") {
                    event.preventDefault();
                    moveTabFocus(FEATURES.length - 1);
                  }
                }}
                className={`focus-visible:ring-brand relative min-h-11 shrink-0 cursor-pointer touch-manipulation overflow-hidden rounded-full border px-4 py-2 text-left text-sm font-medium whitespace-nowrap transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-offset-2 lg:shrink lg:rounded-2xl lg:px-4 lg:py-3.5 lg:whitespace-normal ${
                  selected
                    ? "border-brand bg-brand-soft/60 text-brand-deep shadow-card"
                    : "border-line bg-card text-ink hover:border-line-strong"
                }`}
              >
                <span className="font-display block text-sm font-semibold tracking-tight">
                  {f.title}
                </span>
                <span className="text-ink-soft mt-1 hidden text-[13px] leading-snug font-normal lg:block">
                  {f.body}
                </span>
                {autoAdvance && selected && !reducedMotion && (
                  <span
                    aria-hidden="true"
                    className="bg-brand/15 absolute inset-x-0 bottom-0 block h-0.5"
                  >
                    <span
                      ref={progressRef}
                      className="bg-brand block h-full"
                      style={{ width: "0%" }}
                    />
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {!reducedMotion && (
          <button
            type="button"
            onClick={toggleRotation}
            className="text-ink-soft hover:text-ink focus-visible:ring-brand inline-flex min-h-11 w-fit cursor-pointer touch-manipulation items-center gap-2 rounded-lg px-2 text-xs font-medium transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-offset-2"
          >
            {autoAdvance ? (
              <Pause className="size-3.5" aria-hidden="true" />
            ) : (
              <Play className="size-3.5" aria-hidden="true" />
            )}
            {autoAdvance ? "Pause rotation" : "Resume rotation"}
          </button>
        )}
      </div>

      <div>
        <div
          id="feature-panel"
          role="tabpanel"
          aria-labelledby={`feature-tab-${feature.id}`}
          ref={panelRef}
          className="border-line shadow-hero group relative overflow-hidden rounded-2xl border lg:rounded-3xl"
        >
          {reducedMotion ? (
            videoElement
          ) : (
            <button
              type="button"
              onClick={open}
              aria-haspopup="dialog"
              aria-label={`Product demo: ${feature.title}, enlarge`}
              className="block w-full cursor-zoom-in"
            >
              {videoElement}
              <span className="bg-ink/70 text-canvas pointer-events-none absolute right-3 bottom-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                <Maximize2 className="size-3.5" aria-hidden="true" />
                Enlarge
              </span>
            </button>
          )}
          {!reducedMotion && mediaReady && (
            <button
              type="button"
              onClick={togglePlayback}
              aria-label={paused ? "Play video" : "Pause video"}
              className="bg-ink/70 text-canvas hover:bg-ink/85 absolute bottom-3 left-3 inline-flex size-11 cursor-pointer touch-manipulation items-center justify-center rounded-full transition-colors duration-150"
            >
              {paused ? (
                <Play className="size-4" aria-hidden="true" />
              ) : (
                <Pause className="size-4" aria-hidden="true" />
              )}
            </button>
          )}
        </div>
        <p className="text-ink-soft mt-3 text-sm leading-relaxed lg:hidden">
          {feature.body}
        </p>
      </div>

      {expanded && (
        <VideoLightbox
          open={expanded}
          onClose={close}
          src={feature.video}
          poster={feature.poster}
          label={`Product demo: ${feature.title}`}
        />
      )}
    </div>
  );
};
