"use client";

import { Maximize2, Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useReducedMotion } from "./useReducedMotion";
import { VideoLightbox } from "./VideoLightbox";

/**
 * A single self-playing product demo clip with the same behavior as the
 * landing showcase's video panel: muted looping autoplay that pauses while
 * offscreen or on a hidden browser tab. Media sources are attached only near
 * the viewport, reduced-motion changes are observed live, and a click-to-
 * enlarge lightbox can be dismissed by backdrop, Escape or close button.
 */
export const DemoClip = ({
  src,
  poster,
  label,
  caption,
  className = "",
}: {
  src: string;
  poster: string;
  /** Accessible description, e.g. "Product demo: connecting Atlassian". */
  label: string;
  /** Optional small print rendered under the clip. */
  caption?: string;
  className?: string;
}) => {
  const [expanded, setExpanded] = useState(false);
  const [mediaReady, setMediaReady] = useState(false);
  const [inView, setInView] = useState(false);
  /* Explicit visitor pause of the clip; wins over visibility-driven autoplay. */
  const [paused, setPaused] = useState(false);
  const reducedMotion = useReducedMotion();
  const videoRef = useRef<HTMLVideoElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

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
  }, [inView, mediaReady, paused, reducedMotion]);

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

  const open = () => {
    setMediaReady(true);
    videoRef.current?.pause();
    setExpanded(true);
  };

  const videoElement = mediaReady ? (
    <video
      ref={videoRef}
      src={src}
      poster={poster}
      muted
      loop
      playsInline
      controls={reducedMotion}
      preload="metadata"
      aria-label={label}
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
    <figure className={className}>
      <div
        ref={panelRef}
        className="border-line shadow-float group relative overflow-hidden rounded-2xl border"
      >
        {reducedMotion ? (
          videoElement
        ) : (
          <button
            type="button"
            onClick={open}
            aria-haspopup="dialog"
            aria-label={`${label}, enlarge`}
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
      {caption && (
        <figcaption className="text-ink-faint mt-2 text-xs leading-relaxed">
          {caption}
        </figcaption>
      )}

      {expanded && (
        <VideoLightbox
          open={expanded}
          onClose={close}
          src={src}
          poster={poster}
          label={label}
        />
      )}
    </figure>
  );
};
