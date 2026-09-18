import { requireModel } from "./safety.ts";
import type { SignalPanel } from "./schema.ts";

export type LogicLevel = "HIGH" | "LOW";
export type Transition = { at: number; level: LogicLevel };
export const signalTimeId = (time: number) =>
  `t${String(time).replaceAll("-", "n").replaceAll(".", "d").replaceAll("+", "p")}`;
export function signalEvents(panel: SignalPanel) {
  const data = panel.data;
  const start = data.start;
  const end = data.mode === "samples" ? start + data.values.length * data.period : data.end;
  requireModel(end > start && Number.isFinite(end) && Math.abs(end) <= 1e12, "signal.interval");
  const initial = data.mode === "samples" ? (data.values[0] ?? "LOW") : data.initial;
  const events: Transition[] = [];
  if (data.mode === "samples") {
    for (let i = 1; i < data.values.length; i++) {
      const level = data.values[i];
      if (level && level !== data.values[i - 1])
        events.push({ at: start + i * data.period, level });
    }
  } else {
    let previous = start;
    let level = initial;
    for (const event of data.changes) {
      requireModel(
        event.at > previous && event.at < end && event.level !== level,
        "signal.transition-order",
      );
      events.push(event);
      previous = event.at;
      level = event.level;
    }
  }
  if (panel.window)
    requireModel(
      panel.window.from >= start && panel.window.to <= end && panel.window.from < panel.window.to,
      "signal.window",
    );
  return { start, end, initial, events };
}

export function debounceEvents(
  initial: LogicLevel,
  events: Transition[],
  start: number,
  end: number,
  duration: number,
  outputInitial: LogicLevel,
): Transition[] {
  requireModel(duration > 0 && end > start, "signal.debounce");
  const accepted: Transition[] = [];
  let output = outputInitial;
  const states = [{ at: start, level: initial }, ...events];
  for (let i = 0; i < states.length; i++) {
    const state = states[i];
    if (!state) continue;
    const until = states[i + 1]?.at ?? end;
    const at = state.at + duration;
    if (state.level !== output && at <= until) {
      accepted.push({ at, level: state.level });
      output = state.level;
    }
  }
  return accepted;
}
