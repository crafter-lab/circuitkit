import { z } from "zod";
import { diagnosticFrom, plainJSON, pointer } from "../diagram/safety.ts";
import type { Diagnostic, Failure } from "../types.ts";
import { escapeXML, number, textPath } from "../typography.ts";

export const breadboardLimits = Object.freeze({ rows: 63, parts: 16, pinsPerPart: 64, wires: 64 });

const columns = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"] as const;
type Column = (typeof columns)[number];
const rails = ["L-", "L+", "R+", "R-"] as const;
type Rail = (typeof rails)[number];

const safeId = z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,47}$/);
const label = (maximum: number) =>
  z
    .string()
    .min(1)
    .max(maximum)
    .regex(/^[\x20-\x7E]+$/, "Use printable ASCII text.");
const hole = z
  .string()
  .regex(/^[a-j][1-9][0-9]?$/, 'A terminal hole is a column a–j and a row, such as "c24".');
const endpoint = z
  .string()
  .regex(
    /^(?:[a-j]|[LR][+-])[1-9][0-9]?$/,
    'An endpoint is a terminal hole such as "i26" or a rail hole such as "R-26" or "L+48".',
  );
const pinName = z
  .string()
  .regex(/^(?:-|[A-Za-z0-9_+()/.-]{1,24})$/, 'Pin names are 1–24 characters; "-" is unlabeled.');
const wireColor = z.enum([
  "red",
  "black",
  "blue",
  "green",
  "yellow",
  "orange",
  "purple",
  "white",
  "gray",
  "brown",
]);

const dipSchema = z.strictObject({
  id: safeId,
  label: label(48).optional(),
  kind: z.literal("dip"),
  at: hole.describe("Hole of the top pin of the left row."),
  to: hole.describe("Hole of the bottom pin of the right row."),
  pins: z.strictObject({
    left: z.array(pinName).min(1).max(32).describe("Left row, top to bottom."),
    right: z.array(pinName).min(1).max(32).describe("Right row, top to bottom."),
  }),
  top: label(16).optional().describe('Visible marker at the top edge, such as "USB".'),
});
const headerSchema = z.strictObject({
  id: safeId,
  label: label(48).optional(),
  kind: z.literal("header"),
  at: hole.describe("Hole of the first (top) pin."),
  pins: z.array(pinName).min(1).max(breadboardLimits.pinsPerPart).describe("Top to bottom."),
  body: z
    .enum(["left", "right", "none"])
    .default("none")
    .describe("Side where the module body hangs; drawn translucent."),
});
const partSchema = z.discriminatedUnion("kind", [dipSchema, headerSchema]);
const wireSchema = z.strictObject({
  from: endpoint,
  to: endpoint,
  color: wireColor.optional(),
  label: label(32).optional(),
});

export const breadboardSchema = z.strictObject({
  schema: z.literal("circuitkit.breadboard.v1"),
  id: safeId,
  title: label(120),
  board: z
    .strictObject({
      rows: z.number().int().min(5).max(breadboardLimits.rows).default(breadboardLimits.rows),
      rails: z
        .enum(["full", "split"])
        .default("full")
        .describe("split: each rail is cut in half at the middle row."),
    })
    .default({ rows: breadboardLimits.rows, rails: "full" }),
  parts: z.array(partSchema).max(breadboardLimits.parts),
  wires: z.array(wireSchema).max(breadboardLimits.wires),
  expect: z
    .array(z.tuple([z.string().min(3).max(80), z.string().min(3).max(80)]))
    .max(128)
    .optional()
    .describe(
      'Pairs of "part.PIN" that must be connected. When present, any other connection between part pins is a short.',
    ),
});
export const breadboardJSONSchema = z.toJSONSchema(breadboardSchema, { io: "input" });
export type BreadboardDocument = z.input<typeof breadboardSchema>;
type Document = z.output<typeof breadboardSchema>;
type Part = Document["parts"][number];

export type BreadboardNet = { id: string; pins: string[]; holes: string[] };
export type CompiledBreadboard = {
  ok: true;
  document: Document;
  nets: BreadboardNet[];
  classification: { kind: "breadboard"; connectivity: "derived" };
  diagnostics: Diagnostic[];
};
export type RenderedBreadboard = CompiledBreadboard & {
  svg: string;
  bounds: { width: number; height: number };
};

export const isBreadboardDocument = (input: unknown) =>
  typeof input === "object" &&
  input !== null &&
  (input as { schema?: unknown }).schema === "circuitkit.breadboard.v1";

type Placed = { part: string; pin: string; hole: string; column: number; row: number };

const parseHole = (value: string) => ({
  column: columns.indexOf(value[0] as Column),
  row: Number(value.slice(1)),
});
const isRail = (value: string) => value[0] === "L" || value[0] === "R";

function placePins(part: Part, rows: number, path: string, issues: Diagnostic[]): Placed[] {
  const add = (code: string, message: string) => issues.push({ code, path, message });
  const start = parseHole(part.at);
  const placed: Placed[] = [];
  const push = (pins: string[], column: number, first: number) =>
    pins.forEach((pin, index) => {
      placed.push({
        part: part.id,
        pin,
        hole: `${columns[column]}${first + index}`,
        column,
        row: first + index,
      });
    });
  if (part.kind === "dip") {
    const end = parseHole(part.to);
    const count = end.row - start.row + 1;
    if (end.column <= start.column || count < 1)
      add("breadboard.part_span", "A dip spans from its top-left hole to a lower, right hole.");
    else if (part.pins.left.length !== count || part.pins.right.length !== count)
      add(
        "breadboard.part_pins",
        `Rows ${start.row}–${end.row} hold ${count} pins per side; left has ${part.pins.left.length} and right has ${part.pins.right.length}.`,
      );
    else {
      push(part.pins.left, start.column, start.row);
      push(part.pins.right, end.column, start.row);
    }
  } else push(part.pins, start.column, start.row);
  for (const pin of placed)
    if (pin.row > rows) {
      add(
        "breadboard.out_of_board",
        `Pin ${pin.pin} lands on row ${pin.row}; the board has ${rows}.`,
      );
      return [];
    }
  return placed;
}

// Connectivity: each terminal strip is five holes of a row on one side of the gap;
// each rail runs the full length unless split.
function stripOf(point: string, rows: number, split: boolean) {
  if (isRail(point)) {
    const row = Number(point.slice(2));
    const half = split ? (row <= Math.ceil(rows / 2) ? ":1" : ":2") : "";
    return `rail:${point.slice(0, 2)}${half}`;
  }
  const { column, row } = parseHole(point);
  return `strip:${row}${column < 5 ? "L" : "R"}`;
}

class Union {
  parent = new Map<string, string>();
  find(key: string): string {
    const parent = this.parent.get(key) ?? key;
    if (parent === key) {
      this.parent.set(key, key);
      return key;
    }
    const root = this.find(parent);
    this.parent.set(key, root);
    return root;
  }
  join(a: string, b: string) {
    this.parent.set(this.find(a), this.find(b));
  }
}

function analyze(document: Document) {
  const issues: Diagnostic[] = [];
  const { rows } = document.board;
  const split = document.board.rails === "split";
  const occupied = new Map<string, string>();
  const placed: Placed[] = [];
  const ids = new Set<string>();
  document.parts.forEach((part, index) => {
    const path = `/parts/${index}`;
    if (ids.has(part.id))
      issues.push({
        code: "breadboard.duplicate_part",
        path: `${path}/id`,
        message: `Part ${part.id} is declared twice.`,
      });
    ids.add(part.id);
    for (const pin of placePins(part, rows, path, issues)) {
      const owner = occupied.get(pin.hole);
      if (owner)
        issues.push({
          code: "breadboard.occupied",
          path,
          message: `Hole ${pin.hole} already holds ${owner}; ${part.id}.${pin.pin} cannot share it.`,
        });
      occupied.set(pin.hole, `${part.id}.${pin.pin}`);
      placed.push(pin);
    }
  });
  document.wires.forEach((wire, index) => {
    for (const key of ["from", "to"] as const) {
      const point = wire[key];
      const path = `/wires/${index}/${key}`;
      const row = Number(isRail(point) ? point.slice(2) : point.slice(1));
      if (row > rows)
        issues.push({
          code: "breadboard.out_of_board",
          path,
          message: `Row ${row} is past the last row ${rows}.`,
        });
      const owner = occupied.get(point);
      if (owner)
        issues.push({
          code: "breadboard.occupied",
          path,
          message: `Hole ${point} already holds ${owner}; use a free hole in the same strip.`,
        });
      occupied.set(point, `wire ${index + 1}`);
    }
    if (stripOf(wire.from, rows, split) === stripOf(wire.to, rows, split))
      issues.push({
        code: "breadboard.redundant_wire",
        path: `/wires/${index}`,
        message: "Both ends are in the same strip, so the wire connects nothing new.",
      });
  });

  const union = new Union();
  for (const pin of placed) {
    union.join(`pin:${pin.part}.${pin.pin}#${pin.hole}`, stripOf(pin.hole, rows, split));
    // Repeated pin names on one part are the same terminal (for example every GND).
    if (pin.pin !== "-")
      union.join(`pin:${pin.part}.${pin.pin}#${pin.hole}`, `term:${pin.part}.${pin.pin}`);
  }
  for (const wire of document.wires)
    union.join(stripOf(wire.from, rows, split), stripOf(wire.to, rows, split));

  const groups = new Map<string, { pins: Set<string>; holes: Set<string> }>();
  for (const pin of placed) {
    if (pin.pin === "-") continue;
    const root = union.find(stripOf(pin.hole, rows, split));
    const group = groups.get(root) ?? { pins: new Set(), holes: new Set() };
    group.pins.add(`${pin.part}.${pin.pin}`);
    group.holes.add(pin.hole);
    groups.set(root, group);
  }
  for (const wire of document.wires)
    for (const point of [wire.from, wire.to]) {
      const group = groups.get(union.find(stripOf(point, rows, split)));
      group?.holes.add(point);
    }
  const nets = [...groups.values()]
    .map((group) => ({ pins: [...group.pins].sort(), holes: [...group.holes].sort() }))
    .filter((net) => net.pins.length > 1)
    .sort((a, b) => (a.pins[0] ?? "").localeCompare(b.pins[0] ?? ""))
    .map((net, index) => ({ id: `N${index + 1}`, ...net }));

  if (document.expect) {
    const known = new Set(placed.map((pin) => `${pin.part}.${pin.pin}`));
    const expected = new Union();
    const netOf = new Map<string, string>();
    for (const net of nets) for (const pin of net.pins) netOf.set(pin, net.id);
    document.expect.forEach(([a, b], index) => {
      for (const [slot, pin] of [a, b].entries())
        if (!known.has(pin))
          issues.push({
            code: "breadboard.pin_unknown",
            path: `/expect/${index}/${slot}`,
            message: `${pin} is not a placed part pin.`,
          });
      expected.join(a, b);
      if (
        known.has(a) &&
        known.has(b) &&
        (netOf.get(a) === undefined || netOf.get(a) !== netOf.get(b))
      )
        issues.push({
          code: "breadboard.expect_open",
          path: `/expect/${index}`,
          message: `${a} and ${b} should be connected but are not.`,
        });
    });
    for (const net of nets) {
      const roots = new Set(net.pins.map((pin) => expected.find(pin)));
      if (roots.size > 1)
        issues.push({
          code: "breadboard.short",
          path: "/wires",
          message: `Unexpected connection: ${net.pins.join(", ")} share net ${net.id}.`,
        });
    }
  }
  return { issues, placed, nets, occupied };
}

export function compileBreadboard(input: unknown): CompiledBreadboard | Failure {
  let value: unknown;
  try {
    value = plainJSON(input);
  } catch (error) {
    return {
      ok: false,
      diagnostics: [
        diagnosticFrom(error) ?? {
          code: "breadboard.invalid",
          path: "",
          message: "Invalid breadboard input.",
        },
      ],
    };
  }
  const parsed = breadboardSchema.safeParse(value);
  if (!parsed.success)
    return {
      ok: false,
      diagnostics: parsed.error.issues.flatMap((issue) =>
        (issue.code === "unrecognized_keys"
          ? issue.keys.map((key) => [...issue.path, key])
          : [issue.path]
        ).map((path) => ({
          code: "breadboard.schema",
          path: pointer(path),
          message: issue.message,
        })),
      ),
    };
  const { issues, nets } = analyze(parsed.data);
  if (issues.length) return { ok: false, diagnostics: issues };
  return {
    ok: true,
    document: parsed.data,
    nets,
    classification: { kind: "breadboard", connectivity: "derived" },
    diagnostics: [],
  };
}

const palette = {
  background: "#ffffff",
  board: "#f4f4f2",
  boardEdge: "#d4d4d0",
  hole: "#b9b9b4",
  label: "#171717",
  muted: "#737373",
  plus: "#d92d20",
  minus: "#1f5fbf",
  pin: "#e0b020",
  dip: "#2f7a45",
  header: "#c93030",
  strip: "#0068d6",
};
const wireHex: Record<z.infer<typeof wireColor>, string> = {
  red: "#e5322d",
  black: "#262626",
  blue: "#1f6fe0",
  green: "#1f9d4a",
  yellow: "#f2c300",
  orange: "#f07c12",
  purple: "#8b3fd1",
  white: "#f5f5f5",
  gray: "#8a8a8a",
  brown: "#8a5a2b",
};
const autoColors = ["blue", "green", "orange", "purple", "yellow", "brown", "gray"] as const;

const P = 18;
const top = 70;
const left = 210;
// x positions in pitch units: L- L+ | a..e | gap | f..j | R+ R-
const columnX = (column: number) => left + (column + (column >= 5 ? 4.5 : 2)) * P;
const railX: Record<Rail, number> = {
  "L-": left,
  "L+": left + P,
  "R+": left + 15.5 * P,
  "R-": left + 16.5 * P,
};
const rowY = (row: number) => top + (row - 1) * P;
const pointXY = (point: string) =>
  isRail(point)
    ? { x: railX[point.slice(0, 2) as Rail], y: rowY(Number(point.slice(2))) }
    : (() => {
        const { column, row } = parseHole(point);
        return { x: columnX(column), y: rowY(row) };
      })();

function text(
  value: string,
  size: number,
  x: number,
  y: number,
  fill: string,
  align: "left" | "center" | "right" = "left",
  family: "sans" | "mono" = "sans",
) {
  return `<g fill="${fill}">${textPath(value, family, size, x, y, align).svg}</g>`;
}

export function renderBreadboardSVG(input: unknown): RenderedBreadboard | Failure {
  const compiled = compileBreadboard(input);
  if (!compiled.ok) return compiled;
  const document = compiled.document;
  const { rows } = document.board;
  const { placed, nets } = analyze(document);
  const boardRight = railX["R-"] + P * 2.2;
  const legendX = boardRight + 40;
  const out: string[] = [];
  const height = Math.max(rowY(rows) + 60, 120 + document.wires.length * 22 + 200);
  const width = legendX + 420;

  out.push(`<rect width="${width}" height="${height}" fill="${palette.background}"/>`);
  out.push(text(document.title, 18, 24, 34, palette.label));
  out.push(
    `<rect x="${left - P * 2.2}" y="${top - 2 * P}" width="${boardRight - left + P * 2.2}" height="${rowY(rows) - top + 3 * P}" rx="8" fill="${palette.board}" stroke="${palette.boardEdge}"/>`,
  );
  out.push(
    `<rect x="${columnX(4) + P * 0.6}" y="${top - P}" width="${columnX(5) - columnX(4) - P * 1.2}" height="${rowY(rows) - top + 2 * P}" fill="${palette.boardEdge}" opacity="0.5"/>`,
  );
  for (const rail of rails) {
    const color = rail.endsWith("+") ? palette.plus : palette.minus;
    const offset = rail.startsWith("L") === rail.endsWith("-") ? -P / 2 : P / 2;
    out.push(
      `<line x1="${railX[rail] + offset}" y1="${top - P}" x2="${railX[rail] + offset}" y2="${rowY(rows) + P / 2}" stroke="${color}" stroke-width="1.5" opacity="0.6"/>`,
    );
    out.push(text(rail.endsWith("+") ? "+" : "-", 14, railX[rail], top - P - 4, color, "center"));
    if (document.board.rails === "split") {
      const y = (rowY(Math.ceil(rows / 2)) + rowY(Math.ceil(rows / 2) + 1)) / 2;
      out.push(
        `<line x1="${railX[rail] - 5}" y1="${y}" x2="${railX[rail] + 5}" y2="${y}" stroke="${palette.label}" stroke-width="2"/>`,
      );
    }
  }
  columns.forEach((column, index) => {
    out.push(text(column, 11, columnX(index), top - P * 0.9, palette.muted, "center"));
    out.push(text(column, 11, columnX(index), rowY(rows) + P * 1.1, palette.muted, "center"));
  });

  // Strips that carry a net are tinted so the shared contacts are visible.
  const usedStrips = new Set<string>();
  for (const net of nets)
    for (const point of net.holes)
      if (!isRail(point))
        usedStrips.add(`${point.slice(1)}${parseHole(point).column < 5 ? "L" : "R"}`);
  for (let row = 1; row <= rows; row++) {
    const y = rowY(row);
    if (row === 1 || row % 5 === 0) {
      out.push(text(String(row), 10, railX["L-"] - P * 1.1, y + 3.5, palette.muted, "right"));
      out.push(text(String(row), 10, railX["R-"] + P * 1.1, y + 3.5, palette.muted, "left"));
    }
    for (const side of ["L", "R"] as const)
      if (usedStrips.has(`${row}${side}`)) {
        const x1 = columnX(side === "L" ? 0 : 5) - P / 2;
        out.push(
          `<rect x="${x1}" y="${y - P / 2 + 2}" width="${P * 5}" height="${P - 4}" rx="3" fill="${palette.strip}" opacity="0.12"/>`,
        );
      }
    for (let column = 0; column < 10; column++)
      out.push(
        `<rect x="${columnX(column) - 3}" y="${y - 3}" width="6" height="6" rx="1" fill="${palette.hole}"/>`,
      );
    for (const rail of rails)
      out.push(
        `<rect x="${railX[rail] - 3}" y="${y - 3}" width="6" height="6" rx="1" fill="${palette.hole}"/>`,
      );
  }

  for (const part of document.parts) {
    const pins = placed.filter((pin) => pin.part === part.id);
    const first = parseHole(part.at);
    const lastRow = Math.max(...pins.map((pin) => pin.row));
    const name = part.label ?? part.id;
    if (part.kind === "dip") {
      const end = parseHole(part.to);
      const x1 = columnX(first.column) - P * 0.7;
      const x2 = columnX(end.column) + P * 0.7;
      const y1 = rowY(first.row) - P * 0.8;
      const y2 = rowY(lastRow) + P * 0.8;
      out.push(
        `<rect x="${x1}" y="${y1}" width="${x2 - x1}" height="${y2 - y1}" rx="4" fill="${palette.dip}" opacity="0.92"/>`,
      );
      if (part.top) {
        out.push(
          `<rect x="${(x1 + x2) / 2 - 16}" y="${y1 - 12}" width="32" height="14" rx="2" fill="#a3a3a3" stroke="#525252"/>`,
        );
        out.push(text(part.top, 10, (x1 + x2) / 2, y1 - 16, palette.label, "center"));
      }
      out.push(text(name, 13, (x1 + x2) / 2, (y1 + y2) / 2, "#ffffff", "center"));
      for (const pin of pins) {
        const isLeft = pin.column === first.column;
        if (pin.pin !== "-")
          out.push(
            text(
              pin.pin,
              8.5,
              columnX(pin.column) + (isLeft ? 8 : -8),
              rowY(pin.row) + 3,
              "#ffffff",
              isLeft ? "left" : "right",
              "mono",
            ),
          );
      }
    } else {
      const x = columnX(first.column);
      const y1 = rowY(first.row) - P * 0.6;
      const y2 = rowY(lastRow) + P * 0.6;
      if (part.body !== "none") {
        const bodyWidth = 150;
        const bx = part.body === "left" ? x - P * 0.6 - bodyWidth : x + P * 0.6;
        out.push(
          `<rect x="${bx}" y="${y1 - P}" width="${bodyWidth + P * 0.6}" height="${y2 - y1 + 2 * P}" rx="6" fill="${palette.header}" opacity="0.82"/>`,
        );
        out.push(text(name, 12, bx + bodyWidth / 2, y1 - P * 0.25, "#ffffff", "center"));
      }
      out.push(
        `<rect x="${x - P * 0.45}" y="${y1}" width="${P * 0.9}" height="${y2 - y1}" rx="2" fill="#2b2b2b" opacity="0.85"/>`,
      );
      for (const pin of pins)
        if (pin.pin !== "-") {
          const labelLeft = part.body !== "right";
          out.push(
            text(
              pin.pin,
              9,
              x + (labelLeft ? -P * 0.75 : P * 0.75),
              rowY(pin.row) + 3.2,
              part.body === "none" ? palette.label : "#ffffff",
              labelLeft ? "right" : "left",
              "mono",
            ),
          );
        }
    }
    for (const pin of pins)
      out.push(
        `<circle cx="${columnX(pin.column)}" cy="${rowY(pin.row)}" r="4" fill="${palette.pin}" stroke="#3a3a3a" stroke-width="0.8"/>`,
      );
  }

  const occupantOf = (point: string) => {
    if (isRail(point)) return `${point.slice(0, 2)} rail`;
    const { column, row } = parseHole(point);
    const leftSide = column < 5;
    const pin = placed.find((p) => p.row === row && p.column < 5 === leftSide && p.pin !== "-");
    return pin ? `${pin.part}.${pin.pin}` : "";
  };
  let auto = 0;
  document.wires.forEach((wire, index) => {
    const a = pointXY(wire.from);
    const b = pointXY(wire.to);
    const ends = [occupantOf(wire.from), occupantOf(wire.to)];
    const power = ends.some((end) => /^R\+|^L\+/.test(end));
    const ground = ends.some((end) => /^R-|^L-/.test(end));
    const color =
      wireHex[
        wire.color ??
          (power ? "red" : ground ? "black" : (autoColors[auto++ % autoColors.length] ?? "blue"))
      ];
    const bow = Math.min(90, 26 + Math.abs(b.y - a.y) * 0.35);
    const side = a.x + b.x > columnX(4) + columnX(5) ? 1 : -1;
    const d =
      Math.abs(a.y - b.y) < 1
        ? `M${number(a.x)},${number(a.y)} C${number(a.x)},${number(a.y - 22)} ${number(b.x)},${number(b.y - 22)} ${number(b.x)},${number(b.y)}`
        : `M${number(a.x)},${number(a.y)} C${number(a.x + side * bow)},${number(a.y)} ${number(b.x + side * bow)},${number(b.y)} ${number(b.x)},${number(b.y)}`;
    out.push(
      `<path d="${d}" fill="none" stroke="#ffffff" stroke-width="6.5" stroke-linecap="round" opacity="0.9"/>`,
    );
    out.push(
      `<path d="${d}" fill="none" stroke="${color}" stroke-width="3.5" stroke-linecap="round"/>`,
    );
    for (const p of [a, b])
      out.push(
        `<circle cx="${number(p.x)}" cy="${number(p.y)}" r="4.5" fill="${color}" stroke="#171717" stroke-width="1"/>`,
      );
    const y = 92 + index * 22;
    out.push(
      `<rect x="${legendX}" y="${y - 9}" width="18" height="10" rx="2" fill="${color}" stroke="#171717" stroke-width="0.6"/>`,
    );
    const describe = (point: string, end: string) =>
      end && !end.endsWith("rail") ? `${point} (${end})` : point;
    out.push(
      text(
        `${index + 1}. ${describe(wire.from, ends[0] ?? "")} -> ${describe(wire.to, ends[1] ?? "")}${wire.label ? `  ${wire.label}` : ""}`,
        11.5,
        legendX + 26,
        y,
        palette.label,
        "left",
        "mono",
      ),
    );
  });
  out.push(text(`${document.wires.length} wires`, 14, legendX, 68, palette.label));
  const footY = 92 + document.wires.length * 22 + 20;
  const notes = [
    `${nets.length} nets derived from strips, rails and wires.`,
    document.expect
      ? `Checked against ${document.expect.length} expected connections: no open or short.`
      : "No expected connections declared; nothing was checked.",
    "Simplified layout: not to scale, not electrical verification.",
  ];
  notes.forEach((note, index) => {
    out.push(text(note, 11, legendX, footY + index * 18, palette.muted));
  });

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXML(document.title)}">${out.join("")}</svg>`;
  return { ...compiled, svg, bounds: { width, height } };
}
