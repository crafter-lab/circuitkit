"use client";

import {
  type CSSProperties,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { directionArrow, presentationFigure } from "../src/language/scene.ts";
import type { PresentationPlan, SourceRange } from "../src/language/types.ts";
import { renderEducationalSVG } from "../src/v2/render.ts";
import type { PublicFigure } from "../src/v2/schema.ts";
import { focusPreview } from "./preview-figure.ts";
import { useSiteTheme } from "./theme-provider.tsx";
import { ToolMenu, UIIcon } from "./ui-controls.tsx";
import "./presentation-viewer.css";

function subscribeMotion(notify: () => void) {
  const query = matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
}
const reducedSnapshot = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
function subscribeVisibility(notify: () => void) {
  document.addEventListener("visibilitychange", notify);
  return () => document.removeEventListener("visibilitychange", notify);
}
const hiddenSnapshot = () => document.hidden;
const safeSnapshot = () => true;
const layers = [
  { length: 104, offset: 0, width: 9, opacity: 0.1 },
  { length: 78, offset: -13, width: 7, opacity: 0.25 },
  { length: 48, offset: -28, width: 6, opacity: 0.5 },
  { length: 24, offset: -40, width: 5, opacity: 1 },
];

export default function PresentationViewer({
  figure,
  presentation,
  onReveal,
  compact = true,
  variant = "editor",
  selectedScene,
  onSceneChange,
  appearance = "site",
}: {
  figure: PublicFigure;
  presentation: PresentationPlan;
  onReveal?: (range: SourceRange) => void;
  compact?: boolean;
  variant?: "editor" | "landing";
  selectedScene?: string;
  onSceneChange?: (id: string) => void;
  appearance?: "site" | "authored";
}) {
  const id = useId();
  const { theme: siteTheme, mounted } = useSiteTheme();
  const displayTheme = appearance === "site" ? (`geist-${siteTheme}` as const) : figure.theme;
  const [internalSelected, setSelected] = useState(
    () => presentation.scenes.find((scene) => !scene.unavailable.length)?.id ?? "",
  );
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [replay, setReplay] = useState(0);
  const [fit, setFit] = useState(compact);
  const [motionAvailable, setMotionAvailable] = useState(true);
  const overlay = useRef<SVGSVGElement>(null);
  const reduced = useSyncExternalStore(subscribeMotion, reducedSnapshot, safeSnapshot);
  const hidden = useSyncExternalStore(subscribeVisibility, hiddenSnapshot, safeSnapshot);
  const selected = selectedScene ?? internalSelected;
  const scene = presentation.scenes.find((value) => value.id === selected);
  const active = scene && !scene.unavailable.length ? scene : undefined;
  const staticOnly = reduced || !motionAvailable;
  const snapshot = useMemo(
    () =>
      renderEducationalSVG(
        focusPreview(presentationFigure({ ...figure, theme: displayTheme }, active)),
        {
          namespace: `scene-${id.replace(/[^A-Za-z0-9_-]/g, "")}`,
        },
      ),
    [figure, active, id, displayTheme],
  );
  const flows = active?.flows ?? [];
  useEffect(() => {
    if (staticOnly) return;
    try {
      if (overlay.current && typeof overlay.current.getAnimations !== "function") {
        setMotionAvailable(false);
        return;
      }
      const animations = overlay.current?.getAnimations({ subtree: true }) ?? [];
      for (const animation of animations) {
        animation.updatePlaybackRate(speed);
        if (playing && !hidden) animation.play();
        else animation.pause();
      }
    } catch {
      setMotionAvailable(false);
    }
  }, [staticOnly, hidden, playing, speed, active, replay]);
  const mode = staticOnly
    ? "static"
    : !flows.length
      ? "highlight"
      : playing && !hidden
        ? "playing"
        : "paused";
  if (!snapshot.ok)
    return <p role="alert">This presentation could not be drawn. Your source is preserved.</p>;
  return (
    <section
      className="presentation-viewer"
      data-figure-theme={displayTheme}
      data-variant={variant}
      data-appearance={appearance}
      data-theme-ready={mounted}
      data-fit={fit}
      data-mode={mode}
      data-scene={active?.id ?? "base"}
      aria-label="Circuit presentation"
    >
      <div className="presentation-controls">
        {variant === "landing" ? (
          <span className="presentation-label">Live preview</span>
        ) : (
          <select
            id={`${id}-scene`}
            aria-label="Scene"
            value={selected}
            onChange={(event) => {
              setSelected(event.currentTarget.value);
              onSceneChange?.(event.currentTarget.value);
              setReplay((value) => value + 1);
            }}
          >
            <option value="">All connections</option>
            {presentation.scenes.map((value) => (
              <option key={value.id} value={value.id}>
                {value.label}
                {value.unavailable.length ? " · unavailable" : ""}
              </option>
            ))}
          </select>
        )}
        <div className="presentation-tools">
          <button
            className="ck-tool ck-icon-button"
            type="button"
            aria-label={playing ? "Pause flow" : "Play flow"}
            title={playing ? "Pause flow" : "Play flow"}
            disabled={staticOnly || !flows.length}
            onClick={() => setPlaying((value) => !value)}
          >
            <UIIcon name={playing ? "pause" : "play"} />
          </button>
          {variant !== "landing" ? (
            <>
              <button
                className="ck-tool ck-icon-button"
                type="button"
                aria-label={fit ? "Actual size" : "Fit canvas"}
                title={fit ? "Actual size" : "Fit canvas"}
                aria-pressed={fit}
                onClick={() => setFit((value) => !value)}
              >
                <UIIcon name={fit ? "expand" : "fit"} />
              </button>
              <ToolMenu label="Playback options">
                <button
                  type="button"
                  data-menu-close
                  disabled={staticOnly || !flows.length}
                  onClick={() => {
                    setPlaying(true);
                    setReplay((value) => value + 1);
                  }}
                >
                  Replay flow
                </button>
                <label htmlFor={`${id}-speed`}>
                  Playback speed
                  <select
                    id={`${id}-speed`}
                    value={speed}
                    disabled={staticOnly || !flows.length}
                    onChange={(event) => setSpeed(Number(event.currentTarget.value))}
                  >
                    <option value={0.5}>0.5×</option>
                    <option value={1}>1×</option>
                    <option value={2}>2×</option>
                  </select>
                </label>
                {onReveal && scene ? (
                  <button type="button" data-menu-close onClick={() => onReveal(scene.range)}>
                    Reveal scene source
                  </button>
                ) : null}
                <hr />
                {scene?.unavailable.length ? <p>{scene.unavailable.join(" ")}</p> : null}
                <p>
                  Illustrative flow, not electrical simulation. Speed is visual. Exports keep the
                  static base diagram.
                </p>
              </ToolMenu>
            </>
          ) : null}
        </div>
      </div>
      <section
        className="presentation-scroll"
        tabIndex={0}
        aria-label="Circuit presentation viewport"
      >
        <div
          className="presentation-canvas"
          style={{
            width: fit ? "100%" : snapshot.bounds.width,
            height: fit ? "100%" : snapshot.bounds.height,
          }}
        >
          <img
            src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(snapshot.svg)}`}
            alt={`${figure.title}. ${active ? active.label : "Base diagram"}. Declared connectivity, not simulation.`}
            width={snapshot.bounds.width}
            height={snapshot.bounds.height}
          />
          <svg
            ref={overlay}
            className="presentation-overlay"
            role="presentation"
            viewBox={`${snapshot.bounds.x} ${snapshot.bounds.y} ${snapshot.bounds.width} ${snapshot.bounds.height}`}
          >
            {flows.map((flow) => (
              <g key={`${flow.target}-${replay}`} data-flow-target={flow.target}>
                {staticOnly ? (
                  <polygon className="presentation-arrow" points={directionArrow(flow.points)} />
                ) : (
                  layers.map((layer) => (
                    <path
                      key={layer.length}
                      className="presentation-sweep"
                      d={flow.points
                        .map((point, index) => `${index ? "L" : "M"}${point.x} ${point.y}`)
                        .join(" ")}
                      pathLength={1000}
                      strokeDasharray={`${layer.length} ${1000 - layer.length}`}
                      strokeWidth={layer.width}
                      opacity={layer.opacity}
                      style={
                        {
                          "--sweep-offset": `${layer.offset}px`,
                          animationDuration: `${flow.periodMs}ms`,
                        } as CSSProperties
                      }
                    />
                  ))
                )}
              </g>
            ))}
          </svg>
        </div>
      </section>
      <div className="presentation-status" role="status" title={scene?.unavailable.join(" ")}>
        {scene?.unavailable.length ? (
          <span>Scene unavailable in this view · See options</span>
        ) : (
          <>
            <span>{active?.label ?? "All connections"}</span>
            <span>
              {staticOnly && flows.length
                ? "Reduced motion"
                : flows.length
                  ? "Illustrative flow"
                  : "Static view"}
            </span>
          </>
        )}
      </div>
    </section>
  );
}
