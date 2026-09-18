"use client";

import { type RefObject, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";

export type SwitchPhase = "open" | "closing" | "closed";
export const CONTACT_SETTLE_MS = 240;
export const supplyPath = "M160 238 V154 Q160 142 172 142 H408";
export const returnPath =
  "M498 142 H800 Q812 142 812 154 V232 L800 244 L824 256 L800 268 L824 280 L800 292 L824 304 L812 316 V402 Q812 414 800 414 H172 Q160 414 160 402 V322";
export const externalPath = `${supplyPath} L498 142 ${returnPath.slice("M498 142 ".length)}`;
const layers = [
  { length: 104, phase: 0, opacity: 0.1, width: 9 },
  { length: 78, phase: -13, opacity: 0.25, width: 7 },
  { length: 48, phase: -28, opacity: 0.5, width: 6 },
  { length: 24, phase: -40, opacity: 1, width: 5 },
];

export function flowMode(phase: SwitchPhase, playing: boolean, reduced: boolean) {
  if (phase !== "closed") return phase;
  if (reduced) return "static";
  return playing ? "playing" : "paused";
}

function subscribeMotion(callback: () => void) {
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}
const motionSnapshot = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
function subscribeVisibility(callback: () => void) {
  document.addEventListener("visibilitychange", callback);
  return () => document.removeEventListener("visibilitychange", callback);
}
const visibilitySnapshot = () => document.hidden;
const serverSnapshot = () => true;

export function FlowCircuit({
  phase,
  playing,
  reduced,
  replay = 0,
  sweepRef,
}: {
  phase: SwitchPhase;
  playing: boolean;
  reduced: boolean;
  replay?: number;
  sweepRef?: RefObject<SVGGElement | null>;
}) {
  const id = useId();
  const closed = phase === "closed";
  return (
    <svg
      className="flow-circuit"
      data-phase={phase}
      viewBox="0 0 1000 520"
      role="img"
      aria-labelledby={`${id}-title ${id}-description`}
    >
      <title id={`${id}-title`}>Source, ideal switch and resistive load</title>
      <desc id={`${id}-description`}>
        {closed
          ? "The switch is closed. An illustrative route runs from the positive source terminal through the switch and load, returning to the negative terminal."
          : "The switch is open or moving. No flow is illustrated across the contact gap. The source is still present."}
        {reduced
          ? " Motion is reduced; static arrows show the declared direction."
          : " Sweep speed is visual only, not a current or voltage measurement."}
      </desc>
      <g className="flow-wires" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d={supplyPath} />
        <path d={returnPath} />
        <path className="flow-contact" d="M408 142 L498 142" />
      </g>
      {closed && !reduced ? (
        <g
          key={replay}
          ref={sweepRef}
          className="flow-sweeps"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {layers.map((layer) => (
            <path
              key={layer.length}
              className="flow-sweep"
              d={externalPath}
              pathLength={1000}
              strokeDasharray={`${layer.length} ${1000 - layer.length}`}
              strokeWidth={layer.width}
              opacity={layer.opacity}
              style={{ animationDelay: `${(layer.phase / 1000) * 3600}ms` }}
            />
          ))}
        </g>
      ) : null}
      <g className="flow-terminals">
        <circle cx={408} cy={142} r={5} />
        <circle cx={498} cy={142} r={5} />
      </g>
      <g className="flow-source">
        <circle cx={160} cy={280} r={42} />
        <path d="M150 263 H170 M160 253 V273 M150 298 H170" />
      </g>
      {closed && (reduced || !playing) ? (
        <g className="flow-arrows">
          <path d="M618 136 L630 142 L618 148 Z" />
          <path d="M806 358 L812 370 L818 358 Z" />
          <path d="M486 408 L474 414 L486 420 Z" />
          <path d="M154 200 L160 188 L166 200 Z" />
        </g>
      ) : null}
      <g className="flow-labels">
        <text x={453} y={68} textAnchor="middle" className="flow-label-strong">
          S1 · Ideal switch
        </text>
        <text x={453} y={204} textAnchor="middle" className="flow-label-secondary">
          {phase === "closed"
            ? "Closed"
            : phase === "closing"
              ? "Closing contact…"
              : "Open contact"}
        </text>
        <text x={82} y={269} textAnchor="middle" className="flow-label-strong">
          V1
        </text>
        <text x={82} y={299} textAnchor="middle">
          +5 V
        </text>
        <text x={232} y={286} className="flow-label-secondary">
          Source
        </text>
        <text x={874} y={267} className="flow-label-strong">
          R1
        </text>
        <text x={874} y={298}>
          Load
        </text>
        <text x={486} y={468} textAnchor="middle" className="flow-label-secondary">
          Return to source −
        </text>
      </g>
    </svg>
  );
}

export default function FlowDemo() {
  const [phase, setPhase] = useState<SwitchPhase>("closed");
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [replay, setReplay] = useState(0);
  const [available, setAvailable] = useState(true);
  const reducedPreference = useSyncExternalStore(subscribeMotion, motionSnapshot, serverSnapshot);
  const hidden = useSyncExternalStore(subscribeVisibility, visibilitySnapshot, serverSnapshot);
  const reduced = reducedPreference || !available;
  const mode = flowMode(phase, playing, reduced);
  const sweep = useRef<SVGGElement>(null);

  useEffect(() => {
    if (phase !== "closing") return;
    const timer = setTimeout(() => setPhase("closed"), CONTACT_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    const element = sweep.current;
    if (!element) return;
    if (typeof element.getAnimations !== "function") {
      setAvailable(false);
      return;
    }
    for (const animation of element.getAnimations({ subtree: true })) {
      if (typeof animation.updatePlaybackRate === "function") animation.updatePlaybackRate(speed);
      else animation.playbackRate = speed;
      if (playing && !hidden && !reduced && phase === "closed") animation.play();
      else animation.pause();
    }
  }, [phase, playing, speed, replay, reduced, hidden]);

  return (
    <section
      className="flow-demo"
      data-phase={phase}
      data-mode={mode}
      aria-label="Flow highlights demo"
    >
      <div className="flow-toolbar">
        <div className="flow-state" role="status">
          <span className="flow-state-mark" aria-hidden="true" />
          {phase === "closed"
            ? "Closed circuit"
            : phase === "closing"
              ? "Closing contact"
              : "Open circuit"}
          <span className="flow-badge">Illustrative</span>
        </div>
        <div className="flow-playback">
          <button
            type="button"
            onClick={() => setPlaying((current) => !current)}
            disabled={reduced || phase !== "closed"}
          >
            {playing && phase === "closed" ? "Pause" : "Play"}
          </button>
          <button
            type="button"
            disabled={reduced || phase !== "closed"}
            onClick={() => {
              setReplay((current) => current + 1);
              setPlaying(true);
            }}
          >
            Replay sweep
          </button>
        </div>
      </div>
      <div className="flow-workspace">
        <div className="flow-preview">
          <section
            className="flow-canvas"
            tabIndex={0}
            aria-label="Circuit diagram. Scroll horizontally on small screens."
          >
            <FlowCircuit
              phase={phase}
              playing={playing}
              reduced={reduced}
              replay={replay}
              sweepRef={sweep}
            />
          </section>
          <div className="flow-caption">
            <span>
              <i className="flow-legend-line" aria-hidden="true" />
              Declared active route
            </span>
            <span>
              {reduced
                ? "Static direction · reduced motion"
                : mode === "paused"
                  ? "Sweep paused · circuit unchanged"
                  : "Visual speed, not measured current"}
            </span>
          </div>
        </div>
        <aside className="flow-controls" aria-label="Scene controls">
          <span className="eyebrow">Try the interaction</span>
          <h2>Close the loop.</h2>
          <p>The contact moves first. The highlight only appears once the path is complete.</p>
          <button
            type="button"
            className="primary flow-switch-button"
            onClick={() => setPhase((current) => (current === "open" ? "closing" : "open"))}
          >
            {phase === "open" ? "Close switch" : "Open switch"}
          </button>
          <label className="flow-speed" htmlFor="flow-speed">
            Visual speed
            <select
              id="flow-speed"
              value={speed}
              disabled={reduced}
              onChange={(event) => {
                const value = event.currentTarget.value;
                if (["0.5", "1", "2"].includes(value)) setSpeed(Number(value));
              }}
            >
              <option value="0.5">Slow · 0.5×</option>
              <option value="1">Normal · 1×</option>
              <option value="2">Fast · 2×</option>
            </select>
          </label>
          <div className="flow-explanation">
            <h3>{phase === "closed" ? "A complete external path" : "A break in the path"}</h3>
            <p>
              {phase === "closed"
                ? "The sweep follows declared conventional-current direction: from + through the switch and load, back to −."
                : "The source is still present, but no current is illustrated across the open contact. Closing it enables the route."}
            </p>
          </div>
          <p className="flow-disclaimer">
            No current values are calculated. Color and speed do not represent amperes, voltage,
            energy packets or propagation time.
          </p>
          {reduced ? (
            <p className="flow-motion-note">
              {reducedPreference
                ? "Your reduced-motion preference is respected. The switch and static arrows still work."
                : "Motion is unavailable in this browser. Static direction remains available."}
            </p>
          ) : null}
        </aside>
      </div>
    </section>
  );
}
