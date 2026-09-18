import { number } from "../typography.ts";
import { type AnnotationRequest, placeAnnotations } from "./annotation-layout.ts";
import { analyzeElectrical, routePoints } from "./electrical.ts";
import { measureMath } from "./math-text.ts";
import { resolveNamedNets, type SemanticNet } from "./nets.ts";
import {
  brokenLine,
  circle,
  label,
  line,
  point,
  polygon,
  rect,
  translateShape,
} from "./primitives.ts";
import { requireModel, unique } from "./safety.ts";
import type {
  ElectricalPanel,
  MathRun,
  Panel,
  Part,
  Point,
  PublicFigure,
  PublicTargetDefinition,
  Shape,
  StageModel,
  Target,
  Value,
} from "./schema.ts";
import { debounceEvents, signalEvents, signalTimeId, type Transition } from "./signals.ts";
import { math, resolveReading, valueRuns } from "./values.ts";

export const partId = (panel: string, category: string, id?: string) =>
  [panel, category, ...(id ? [id] : [])].join("/");
const unitFor = { V: "V", I: "A", R: "Ω", P: "W" } as const;
const inside = (p: Point, width: number, height: number) =>
  p.x >= 0 && p.y >= 0 && p.x <= width && p.y <= height;

export function compileStage(id: string, model: StageModel, validateAllNets = false): PublicFigure {
  unique(model.panels.map((p) => p.id));
  const display: Part[] = [];
  const annotations: AnnotationRequest[] = [];
  const roles = new Map<string, Target["role"]>();
  const netDefinitions = new Map<string, SemanticNet>();
  const exposedNets = new Set(
    model.expose.filter((target) => target.role === "net").map((target) => target.id),
  );
  for (const panel of model.panels) {
    const emit = (
      category: string,
      item: string | undefined,
      role: Target["role"],
      shapes: Shape[],
    ) => {
      const semantic = partId(panel.id, category, item);
      requireModel(!roles.has(semantic) && shapes.length > 0, "identity.part");
      roles.set(semantic, role);
      display.push({ id: semantic, shapes: shapes.map((s) => translateShape(s, panel.at)) });
    };
    const annotation = (
      category: string,
      id: string,
      runs: MathRun[],
      anchor: Point,
      directions: Point[],
      gap: number,
      priority: number,
      fixed?: Point,
    ) => {
      emit(category, id, category === "value" ? "reading" : "label", [
        label(anchor, runs, "center"),
      ]);
      annotations.push({
        part: partId(panel.id, category, id),
        index: 0,
        anchor: point(anchor.x + panel.at.x, anchor.y + panel.at.y),
        directions,
        gap,
        priority,
        preferSide: priority > 0,
        ...(fixed ? { fixed: point(fixed.x + panel.at.x, fixed.y + panel.at.y) } : {}),
      });
    };
    if (panel.title)
      emit("title", undefined, "label", [label(point(0, -24), panel.title, "left", 18)]);
    switch (panel.kind) {
      case "electrical": {
        const groups = analyzeElectrical(panel);
        for (const net of resolveNamedNets(
          panel,
          groups,
          validateAllNets ? undefined : exposedNets,
        ))
          netDefinitions.set(net.id, net);
        for (const route of panel.routes) {
          const points = routePoints(panel, route);
          emit(
            "route",
            route.id,
            "route",
            route.state === "open" ? brokenLine(points) : [line(points)],
          );
        }
        for (const component of panel.components) {
          const a = panel.terminals.find((t) => t.id === component.terminals[0]);
          const b = panel.terminals.find((t) => t.id === component.terminals[1]);
          requireModel(a && b, "graph.reference");
          const length = Math.hypot(b.at.x - a.at.x, b.at.y - a.at.y);
          const ux = (b.at.x - a.at.x) / length;
          const uy = (b.at.y - a.at.y) / length;
          const center = point((a.at.x + b.at.x) / 2, (a.at.y + b.at.y) / 2);
          const p = (x: number, y: number) =>
            point(center.x + ux * x - uy * y, center.y + uy * x + ux * y);
          const shapes: Shape[] = [];
          const leftLead = [a.at, p(-16, 0)];
          shapes.push(
            ...(component.state === "open" && component.kind !== "button"
              ? brokenLine(leftLead)
              : [line(leftLead)]),
            line([p(16, 0), b.at]),
          );
          if (component.kind === "resistor")
            shapes.push(polygon([p(-16, -9), p(16, -9), p(16, 9), p(-16, 9)]));
          if (component.kind === "capacitor")
            shapes.push(
              line([p(-16, 0), p(-5, 0)]),
              line([p(5, 0), p(16, 0)]),
              line([p(-5, -16), p(-5, 16)]),
              line([p(5, -16), p(5, 16)]),
            );
          if (component.kind === "source")
            shapes.push(
              circle(center, 16, "ink", false),
              line([p(-10, 0), p(-4, 0)]),
              line([p(-7, -3), p(-7, 3)]),
              line([p(4, 0), p(10, 0)]),
            );
          if (component.kind === "diode" || component.kind === "led") {
            shapes.push(
              polygon([p(-16, -12), p(-16, 12), p(14, 0)]),
              line([p(16, -12), p(16, 12)]),
            );
            if (component.kind === "led") {
              for (const x of [-4, 8])
                shapes.push(
                  line([p(x, -18), p(x + 12, -30)]),
                  line([p(x + 5, -30), p(x + 12, -30), p(x + 12, -23)]),
                );
            }
          }
          if (component.kind === "button")
            shapes.push(
              circle(p(-16, 0), 3, "ink", false),
              circle(p(16, 0), 3, "ink", false),
              line([p(-16, 0), component.state === "closed" ? p(16, 0) : p(12, -16)]),
            );
          if (component.state === "short")
            shapes.push(line([a.at, p(-length / 2, 22), p(length / 2, 22), b.at], "accent"));
          emit("component", component.id, "component", shapes);
          const vertical = Math.abs(uy) >= Math.abs(ux);
          if (component.label) {
            const anchor = vertical
              ? point(center.x, center.y - measureMath(component.label).bounds.height / 2 - 4)
              : center;
            annotation(
              "label",
              component.id,
              component.label,
              anchor,
              vertical ? [point(1, 0), point(-1, 0)] : [point(0, -1), point(0, 1)],
              24,
              1,
              component.labelAt,
            );
          }
          if (component.kind !== "button" && component.value) {
            const runs = valueRuns(component.value);
            const anchor = vertical
              ? point(center.x, center.y + measureMath(runs).bounds.height / 2 + 4)
              : center;
            annotation(
              "value",
              component.id,
              runs,
              anchor,
              vertical ? [point(1, 0), point(-1, 0)] : [point(0, 1), point(0, -1)],
              24,
              2,
              component.valueAt,
            );
          }
        }
        for (const terminal of panel.terminals) {
          emit("terminal", terminal.id, "terminal", [circle(terminal.at, 3)]);
          if (terminal.label)
            annotation(
              "terminal-label",
              terminal.id,
              terminal.label,
              terminal.at,
              [point(1, -1), point(-1, -1)],
              10,
              0,
              terminal.labelAt,
            );
        }
        break;
      }
      case "measurement": {
        const endpoint = (reference: { panel: string; terminal: string }) => {
          const circuit = model.panels.find(
            (p): p is ElectricalPanel => p.id === reference.panel && p.kind === "electrical",
          );
          const terminal = circuit?.terminals.find((t) => t.id === reference.terminal);
          requireModel(circuit && terminal, "measurement.reference");
          return {
            terminal,
            at: point(
              circuit.at.x + terminal.at.x - panel.at.x,
              circuit.at.y + terminal.at.y - panel.at.y,
            ),
          };
        };
        const positive = endpoint(panel.positive);
        const negative = endpoint(panel.negative);
        let reading: Value;
        if (panel.reading.mode === "authored") reading = panel.reading.value;
        else {
          requireModel(
            positive.terminal.potential && negative.terminal.potential,
            "measurement.potentials-required",
          );
          reading = resolveReading({
            mode: "derived",
            operation: "voltage-difference",
            inputs: [positive.terminal.potential, negative.terminal.potential],
            assumptions: panel.reading.assumptions,
          });
        }
        requireModel(reading.unit === "V", "measurement.unit");
        emit("body", undefined, "body", [
          rect(point(0, 0), 140, 80),
          label(point(70, 22), "DC V", "center"),
          label(point(20, 70), "V", "center", 12),
          label(point(120, 70), "COM", "center", 12),
        ]);
        emit("reading", undefined, "reading", [
          label(point(70, 46), valueRuns(reading), "center", 18),
        ]);
        emit("probe", "positive", "probe", [
          line([positive.at, ...panel.positive.via, point(20, 80)], "positive"),
          circle(positive.at, 5, "positive", false),
        ]);
        emit("probe", "negative", "probe", [
          line([negative.at, ...panel.negative.via, point(120, 80)], "negative"),
          circle(negative.at, 5, "negative", false),
        ]);
        break;
      }
      case "signal": {
        const { start, end, initial, events } = signalEvents(panel);
        const x = (t: number) => ((t - start) / (end - start)) * panel.width;
        const y = (level: string, offset = 0) => offset + (level === "HIGH" ? 0 : panel.height);
        const trace = (initialLevel: string, changes: Transition[], offset: number) => {
          let level = initialLevel;
          const points = [point(0, y(level, offset))];
          for (const event of changes) {
            points.push(
              point(x(event.at), y(level, offset)),
              point(x(event.at), y(event.level, offset)),
            );
            level = event.level;
          }
          points.push(point(panel.width, y(level, offset)));
          return line(points);
        };
        emit("axis", undefined, "axis", [
          line([point(0, 0), point(panel.width, 0)], "muted", true),
          line([point(0, panel.height), point(panel.width, panel.height)], "muted", true),
          label(point(-8, 5), "HIGH", "right", 12),
          label(point(-8, panel.height + 5), "LOW", "right", 12),
          label(point(0, panel.height + 25), `${start} ${panel.unit}`),
          label(point(panel.width, panel.height + 25), `${end} ${panel.unit}`, "right"),
        ]);
        emit("trace", "raw", "trace", [trace(initial, events, 0)]);
        events.forEach((event) => {
          if (
            panel.edges === "both" ||
            panel.edges === (event.level === "HIGH" ? "rising" : "falling")
          )
            emit("edge", signalTimeId(event.at), "edge", [
              circle(point(x(event.at), panel.height / 2), 4, "accent"),
            ]);
        });
        if (panel.data.mode === "samples" && panel.sampleLabels) {
          const data = panel.data;
          data.values.forEach((level, index) => {
            emit("sample", signalTimeId(start + index * data.period), "label", [
              label(point(x(start + (index + 0.5) * data.period), -16), level, "center", 10),
            ]);
          });
        }
        if (panel.window)
          emit("window", undefined, "window", [
            line(
              [
                point(x(panel.window.from), -30),
                point(x(panel.window.from), -40),
                point(x(panel.window.to), -40),
                point(x(panel.window.to), -30),
              ],
              "accent",
            ),
            label(
              point((x(panel.window.from) + x(panel.window.to)) / 2, -48),
              panel.window.label,
              "center",
              12,
            ),
          ]);
        if (panel.debounce) {
          const accepted = debounceEvents(
            initial,
            events,
            start,
            end,
            panel.debounce.duration,
            panel.debounce.initial,
          );
          const offset = panel.height + 70;
          emit("trace", "debounced", "trace", [
            trace(panel.debounce.initial, accepted, offset),
            label(
              point(0, offset - 16),
              `Debounced ${panel.debounce.duration} ${panel.unit}`,
              "left",
              12,
            ),
          ]);
          accepted.forEach((event) => {
            emit("accepted", signalTimeId(event.at), "edge", [
              circle(point(x(event.at), y(event.level, offset)), 4, "accent"),
              label(point(x(event.at), offset + panel.height + 24), `${event.at}`, "center", 12),
            ]);
          });
        }
        break;
      }
      case "timeline": {
        requireModel(panel.modulus !== undefined || panel.wraps === 0, "timeline.modulus-required");
        if (panel.modulus)
          requireModel(
            panel.start < panel.modulus && panel.now < panel.modulus,
            "timeline.counter-range",
          );
        const elapsed = panel.now - panel.start + panel.wraps * (panel.modulus ?? 0);
        requireModel(elapsed >= 0 && Number.isSafeInteger(elapsed), "timeline.wrap-count");
        const shapes = [
          line([point(0, 0), point(panel.width, 0)]),
          label(point(0, 28), `start ${panel.start}`),
          label(point(panel.width, 28), `now ${panel.now}`, "right"),
          label(point(panel.width, 48), panel.unit, "right", 12),
        ];
        if (panel.wraps > 0)
          shapes.push(
            label(
              point(panel.width / 2, -20),
              `${panel.wraps} wrap(s), modulus ${panel.modulus}`,
              "center",
              12,
            ),
          );
        emit("axis", undefined, "axis", shapes);
        for (let wrap = 1; wrap <= panel.wraps; wrap++) {
          const x = (((panel.modulus ?? 0) * wrap - panel.start) / elapsed) * panel.width;
          emit("wrap", String(wrap), "axis", [
            {
              kind: "rect",
              at: point(x - 5, -10),
              width: 10,
              height: 20,
              radius: 0,
              tone: "muted",
              fill: "background",
              stroke: 0.5,
            },
            line([point(x - 4, -7), point(x + 4, 7)], "accent"),
          ]);
        }
        emit("start", undefined, "terminal", [circle(point(0, 0))]);
        emit("now", undefined, "terminal", [circle(point(panel.width, 0), 4, "accent")]);
        if (panel.showElapsed)
          emit("elapsed", undefined, "reading", [
            label(point(panel.width / 2, 72), `${elapsed} ${panel.unit}`, "center", 18),
          ]);
        break;
      }
      case "levels": {
        requireModel(
          panel.low >= 0 && panel.low < panel.high && panel.high <= panel.max,
          "levels.thresholds",
        );
        const x = (v: number) => (v / panel.max) * panel.width;
        const markerX = panel.value?.kind === "known" ? x(panel.value.value) : panel.width / 2;
        const zoneCenters = [
          x(panel.low) / 2,
          (x(panel.low) + x(panel.high)) / 2,
          (x(panel.high) + panel.width) / 2,
        ] as const;
        const trackAnnotation = (
          category: string,
          index: number,
          center: number,
          baseline: number,
          priority: number,
        ) =>
          annotations.push({
            part: partId(panel.id, category),
            index,
            anchor: point(panel.at.x + center, panel.at.y + baseline),
            directions: [point(1, 0)],
            gap: 8,
            priority,
            textGap: category === "axis" ? 12 : 4,
            track: {
              left: panel.at.x,
              right: panel.at.x + panel.width,
              center: panel.at.x + center,
            },
          });
        emit("axis", undefined, "axis", [
          rect(point(0, 0), x(panel.low), 24, "accent"),
          rect(point(x(panel.low), 0), x(panel.high) - x(panel.low), 24, "muted"),
          rect(point(x(panel.high), 0), panel.width - x(panel.high), 24, "accent"),
          label(point(0, -12), "0 V"),
          label(point(x(panel.low), -12), `${panel.low} V`, "center"),
          label(point(x(panel.high), -12), `${panel.high} V`, "center"),
          label(point(panel.width, -12), `${panel.max} V`, "right"),
          label(point(zoneCenters[0], -42), "LOW", "center"),
          label(point(zoneCenters[1], -42), "Not guaranteed", "center", 12),
          label(point(zoneCenters[2], -42), "HIGH", "center"),
        ]);
        zoneCenters.forEach((center, index) => {
          trackAnnotation("axis", index + 7, center, -42, 3);
        });
        if (panel.value) {
          requireModel(panel.value.unit === "V", "levels.unit");
          const shapes: Shape[] = [label(point(markerX, 98), valueRuns(panel.value), "center")];
          if (panel.value.kind === "known") {
            const v = panel.value.value;
            requireModel(v >= 0 && v <= panel.max, "levels.value-range");
            shapes.push(
              line([point(x(v), 0), point(x(v), 64)], "accent"),
              polygon([point(x(v), 64), point(x(v) - 5, 74), point(x(v) + 5, 74)], "accent"),
            );
            if (panel.showClassification)
              shapes.push(
                label(
                  point(markerX, 122),
                  v <= panel.low ? "LOW" : v >= panel.high ? "HIGH" : "Not guaranteed",
                  "center",
                ),
              );
          } else requireModel(!panel.showClassification, "levels.unknown-classification");
          emit("value", undefined, "reading", shapes);
          shapes.forEach((shape, index) => {
            if (shape.kind === "math") trackAnnotation("value", index, markerX, shape.at.y, 2);
          });
        } else requireModel(!panel.showClassification, "levels.value-required");
        break;
      }
      case "quantity":
      case "readings": {
        unique(panel.items.map((item) => item.id));
        const rows = panel.items.map((item) => {
          const value = resolveReading(item.reading);
          const name = "quantity" in item ? math(item.quantity) : item.label;
          if ("quantity" in item)
            requireModel(value.unit === unitFor[item.quantity], "quantity.unit");
          const runs = valueRuns(value);
          return {
            id: item.id,
            name,
            runs,
            nameMetrics: measureMath(name),
            valueMetrics: measureMath(runs, 18),
          };
        });
        const valueColumn = Math.max(
          80,
          ...rows.map(
            (row) =>
              Math.max(
                row.nameMetrics.advance,
                row.nameMetrics.bounds.x + row.nameMetrics.bounds.width,
              ) + 24,
          ),
        );
        const metrics = rows.flatMap((row) => [row.nameMetrics.bounds, row.valueMetrics.bounds]);
        const rowHeight = Math.max(
          38,
          Math.max(...metrics.map((b) => b.y + b.height)) -
            Math.min(...metrics.map((b) => b.y)) +
            16,
        );
        rows.forEach((row, index) => {
          emit("reading", row.id, "reading", [
            label(point(0, index * rowHeight), row.name),
            label(
              point(valueColumn - Math.min(0, row.valueMetrics.bounds.x), index * rowHeight),
              row.runs,
              "left",
              18,
            ),
          ]);
        });
        break;
      }
      case "bars": {
        requireModel(panel.min < panel.max && panel.min <= 0 && panel.max >= 0, "bars.range");
        unique(panel.items.map((item) => item.id));
        const x = (v: number) => ((v - panel.min) / (panel.max - panel.min)) * panel.width;
        emit("axis", undefined, "axis", [
          line([point(x(0), -12), point(x(0), panel.items.length * 48)]),
          label(point(panel.width, panel.items.length * 48 + 24), panel.unit, "right"),
        ]);
        panel.items.forEach((item, index) => {
          requireModel(item.value.unit === panel.unit, "bars.unit");
          const shapes = [
            label(point(-12, index * 48 + 18), item.label, "right"),
            label(point(panel.width + 12, index * 48 + 18), valueRuns(item.value)),
          ];
          if (item.value.kind === "known") {
            const v = item.value.value;
            requireModel(v >= panel.min && v <= panel.max, "bars.value-range");
            shapes.push(
              rect(point(Math.min(x(0), x(v)), index * 48), Math.abs(x(v) - x(0)), 24, "accent"),
            );
          }
          emit("bar", item.id, "reading", shapes);
        });
        if (panel.threshold) {
          requireModel(
            panel.threshold.value >= panel.min && panel.threshold.value <= panel.max,
            "bars.threshold-range",
          );
          emit("threshold", undefined, "axis", [
            line(
              [
                point(x(panel.threshold.value), -16),
                point(x(panel.threshold.value), panel.items.length * 48),
              ],
              "accent",
              true,
            ),
            label(point(x(panel.threshold.value), -24), panel.threshold.label, "center"),
          ]);
        }
        break;
      }
      case "scale": {
        requireModel(
          panel.ticks.every((t, i) => i === 0 || t > (panel.ticks[i - 1] ?? t)),
          "scale.tick-order",
        );
        const min = panel.ticks[0] ?? 0;
        const max = panel.ticks[panel.ticks.length - 1] ?? 1;
        const x = (v: number) => ((v - min) / (max - min)) * panel.width;
        const factor = { n: 1e-9, u: 1e-6, m: 1e-3, "": 1, k: 1e3, M: 1e6 }[panel.prefix];
        const prefix = panel.prefix === "u" ? "µ" : panel.prefix;
        const shapes: Shape[] = [
          line([point(0, 0), point(panel.width, 0)]),
          line([point(0, 80), point(panel.width, 80)]),
          label(point(-12, 5), panel.unit, "right"),
          label(point(-12, 85), `${prefix}${panel.unit}`, "right"),
        ];
        for (const tick of panel.ticks)
          shapes.push(
            line([point(x(tick), -5), point(x(tick), 5)]),
            label(point(x(tick), -16), `${Number(tick.toPrecision(8))}`, "center", 12),
            line([point(x(tick), 75), point(x(tick), 85)]),
            label(point(x(tick), 105), `${Number((tick / factor).toPrecision(8))}`, "center", 12),
          );
        emit("axis", undefined, "axis", shapes);
        requireModel(!(panel.value && panel.input), "scale.ambiguous-input");
        if (panel.value) requireModel(panel.value.unit === panel.unit, "scale.unit");
        if (panel.input || panel.value?.kind === "known") {
          const from = panel.input?.from ?? "base";
          const magnitude =
            panel.input?.magnitude ?? (panel.value?.kind === "known" ? panel.value.value : 0);
          const v = from === "base" ? magnitude : magnitude * factor;
          requireModel(Number.isFinite(v) && (magnitude === 0 || v !== 0), "scale.numeric-range");
          const near = (boundary: number) =>
            from === "prefixed" &&
            Math.abs(v - boundary) <=
              Number.EPSILON * 4 * Math.max(Math.abs(v), Math.abs(boundary));
          requireModel((v >= min || near(min)) && (v <= max || near(max)), "scale.value-range");
          const position = x(Math.min(max, Math.max(min, v)));
          const givenUnit = from === "base" ? panel.unit : `${prefix}${panel.unit}`;
          const givenDisplay =
            panel.input?.display ??
            (panel.value?.kind === "known" ? panel.value.display : undefined);
          const given = [...(givenDisplay ?? math(number(magnitude))), ...math(` ${givenUnit}`)];
          const marks: Shape[] = [
            line([point(position, 0), point(position, 80)], "accent"),
            circle(point(position, from === "base" ? 0 : 80), 4, "accent"),
            label(point(position, from === "base" ? -42 : 134), given, "center"),
          ];
          if (panel.showConverted) {
            const converted = from === "base" ? magnitude / factor : v;
            requireModel(
              Number.isFinite(converted) && (magnitude === 0 || converted !== 0),
              "scale.numeric-range",
            );
            marks.push(
              circle(point(position, from === "base" ? 80 : 0), 4, "accent"),
              label(
                point(position, from === "base" ? 134 : -42),
                `${Number(converted.toPrecision(8))} ${from === "base" ? prefix : ""}${panel.unit}`,
                "center",
              ),
            );
          }
          emit("value", undefined, "reading", marks);
        } else if (panel.value) {
          requireModel(!panel.showConverted, "scale.unknown-conversion");
          emit("value", undefined, "reading", [
            label(point(panel.width / 2, -42), valueRuns(panel.value), "center"),
          ]);
        } else requireModel(!panel.showConverted, "scale.value-required");
        break;
      }
      case "breadboard": {
        unique(panel.contacts.map((c) => c.id));
        unique(panel.groups.map((g) => g.id));
        unique(panel.links.map((link) => link.id));
        const members = panel.groups.flatMap((g) => g.contacts);
        unique(members);
        requireModel(
          members.length === panel.contacts.length &&
            members.every((id) => panel.contacts.some((c) => c.id === id)),
          "physical.contact-partition",
        );
        emit("body", undefined, "body", [rect(point(0, 0), panel.width, panel.height, "muted")]);
        for (const group of panel.groups) {
          const contacts = group.contacts.map((id) => panel.contacts.find((c) => c.id === id));
          if (panel.showGroups && contacts.length > 1)
            emit("group", group.id, "route", [
              line(
                contacts.map((c) => {
                  requireModel(c, "physical.reference");
                  return c.at;
                }),
                "accent",
              ),
            ]);
        }
        for (const contact of panel.contacts) {
          requireModel(inside(contact.at, panel.width, panel.height), "physical.contact-placement");
          emit("contact", contact.id, "contact", [circle(contact.at, 4, "ink", false)]);
          if (contact.label)
            emit("contact-label", contact.id, "label", [
              label(point(contact.at.x, contact.at.y - 12), contact.label, "center", 10),
            ]);
        }
        for (const link of panel.links) {
          const from = panel.contacts.find((c) => c.id === link.from);
          const to = panel.contacts.find((c) => c.id === link.to);
          requireModel(from && to && from.id !== to.id, "physical.link-reference");
          emit("link", link.id, "route", [line([from.at, ...link.via, to.at], "accent")]);
        }
        break;
      }
      case "pinout":
      case "board": {
        unique(panel.pins.map((pin) => pin.id));
        emit("body", undefined, "body", [rect(point(0, 0), panel.width, panel.height, "muted")]);
        for (const pin of panel.pins) {
          requireModel(inside(pin.at, panel.width, panel.height), "physical.pin-placement");
          emit("pin", pin.id, "pin", [
            circle(pin.at, 4, "ink", false),
            label(point(pin.at.x + 10, pin.at.y + 4), pin.label, "left", 12),
            label(point(pin.at.x + 10, pin.at.y + 20), pin.role, "left", 10, "muted"),
          ]);
        }
        if (panel.kind === "board") {
          unique(panel.chips.map((chip) => chip.id));
          for (const chip of panel.chips) {
            requireModel(
              inside(chip.at, panel.width, panel.height) &&
                inside(
                  point(chip.at.x + chip.width, chip.at.y + chip.height),
                  panel.width,
                  panel.height,
                ),
              "physical.chip-placement",
            );
            emit("chip", chip.id, "body", [
              rect(chip.at, chip.width, chip.height),
              label(
                point(chip.at.x + chip.width / 2, chip.at.y + chip.height / 2 + 5),
                chip.label,
                "center",
                12,
              ),
            ]);
          }
        }
        break;
      }
    }
  }
  placeAnnotations(display, annotations);
  unique(model.expose.map((t) => t.id));
  const targets: PublicTargetDefinition[] = model.expose.map((target) => {
    if (target.role === "net") {
      const net = netDefinitions.get(target.id);
      requireModel(net, "net.unresolved-target");
      return { ...target, kind: "group", members: [...net.members] };
    }
    requireModel(roles.get(target.id) === target.role, "target.not-permitted");
    return { ...target };
  });
  return {
    schema: "circuitkit.educational.public.v2",
    id,
    title: model.title,
    description: model.description,
    theme: model.theme,
    display,
    targets,
  };
}

export function validatePanelIdentity(models: StageModel[]) {
  const kinds = new Map<string, Panel["kind"]>();
  const componentKinds = new Map<string, string>();
  for (const model of models) {
    for (const panel of model.panels) {
      const previous = kinds.get(panel.id);
      requireModel(
        previous === undefined || previous === panel.kind,
        "identity.changed-panel-kind",
      );
      kinds.set(panel.id, panel.kind);
      if (panel.kind === "electrical") {
        for (const component of panel.components) {
          const key = `${panel.id}/${component.id}`;
          const kind = componentKinds.get(key);
          requireModel(
            kind === undefined || kind === component.kind,
            "identity.changed-component-kind",
          );
          componentKinds.set(key, component.kind);
        }
      }
    }
  }
}
