export type Timeline<T> = { past: T[]; present: T; future: T[] };
export function newTimeline<T>(present: T): Timeline<T> {
  return { past: [], present, future: [] };
}
export function pushTimeline<T>(timeline: Timeline<T>, present: T): Timeline<T> {
  if (present === timeline.present) return timeline;
  return { past: [...timeline.past.slice(-39), timeline.present], present, future: [] };
}
export function moveTimeline<T>(timeline: Timeline<T>, direction: "undo" | "redo"): Timeline<T> {
  if (direction === "undo") {
    if (!timeline.past.length) return timeline;
    return {
      past: timeline.past.slice(0, -1),
      present: timeline.past[timeline.past.length - 1] as T,
      future: [timeline.present, ...timeline.future],
    };
  }
  if (!timeline.future.length) return timeline;
  return {
    past: [...timeline.past, timeline.present],
    present: timeline.future[0] as T,
    future: timeline.future.slice(1),
  };
}
