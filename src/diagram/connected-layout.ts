import { measureMath } from "../v2/math-text.ts";
import { circle, label, line, part, point, polygon, rect } from "../v2/primitives.ts";
import type { Part, Point, PublicFigure, PublicTargetDefinition, Shape } from "../v2/schema.ts";
import { type Box, bridgeCrossings, enters, type Routed, routeBetween } from "./routing.ts";
import { reject } from "./safety.ts";
import type { DiagramModule, DiagramView, Theme } from "./schema.ts";
import { compare, type Edge, type Model, type Pin } from "./semantics.ts";

type Contact = { pin: Pin; edge?: Edge; side: number; at: Point };
type Node = Box & {
  module: DiagramModule;
  rank: number;
  contacts: Contact[];
  top: Pin[];
  bottom: Pin[];
  reference: string;
  labelLines: string[];
  header: number;
};
type Relation = { a: Node; b: Node; edges: Edge[] };
const order: Record<DiagramModule["kind"], number> = {
  source: 0,
  connector: 1,
  controller: 2,
  sensor: 3,
  display: 4,
  amplifier: 5,
  speaker: 6,
  load: 7,
  module: 8,
};
const names: Record<DiagramModule["kind"], string> = {
  module: "Module",
  source: "Power",
  connector: "Connection",
  controller: "Controller",
  sensor: "Sensor",
  display: "Display",
  amplifier: "Amplifier",
  speaker: "Speaker",
  load: "Load",
};
const prefixes: Record<DiagramModule["kind"], string> = {
  module: "U",
  source: "P",
  connector: "J",
  controller: "U",
  sensor: "U",
  display: "DS",
  amplifier: "U",
  speaker: "LS",
  load: "X",
};

export function connectedLayout(
  model: Model,
  view: DiagramView,
  theme: Theme,
  onRoute?: (edge: Edge, points: Point[]) => void,
): PublicFigure {
  const display: Part[] = [],
    targets: PublicTargetDefinition[] = [];
  const textCache = new Map<string, ReturnType<typeof measureMath>>();
  const metrics = (value: string, size = 18) => {
    const key = `${size}:${value}`;
    let valueMetrics = textCache.get(key);
    if (!valueMetrics) {
      valueMetrics = measureMath([{ text: value, script: "base" }], size);
      textCache.set(key, valueMetrics);
    }
    return valueMetrics;
  };
  const width = (value: string, size = 18) =>
    Math.max(metrics(value, size).advance, metrics(value, size).bounds.width);
  const text = (
    x: number,
    y: number,
    value: string,
    size = 18,
    align: "left" | "center" | "right" = "left",
    tone: Shape["tone"] = "ink",
  ) => {
    const m = metrics(value, size),
      w = width(value, size);
    return label(
      point(
        x - (align === "center" ? w / 2 : align === "right" ? w : 0) - m.bounds.x,
        y - m.bounds.y,
      ),
      value,
      "left",
      size,
      tone,
    );
  };
  const wrap = (value: string) => {
    const lines: string[] = [];
    let current = "";
    for (const character of value) {
      if (current && width(current + character, 22) > 720) {
        lines.push(current);
        current = character;
      } else current += character;
    }
    if (current) lines.push(current);
    return lines;
  };
  const netName = (pin: Pin) => {
    const net = model.netByPin.get(pin.reference);
    if (!net) return "NC";
    const proposed =
      net.labels.length === 1
        ? net.labels[0]
        : net.kinds.length === 1 &&
            net.kinds[0] === "ground" &&
            model.nets.filter((n) => n.kinds.length === 1 && n.kinds[0] === "ground").length === 1
          ? "GND"
          : net.label;
    const duplicate = model.nets.some(
      (n) => n.id !== net.id && n.labels.length === 1 && n.labels[0] === proposed,
    );
    return duplicate ? `${proposed} / ${net.label}` : (proposed as string);
  };
  const isConnector = (id: string) => model.modules.find((m) => m.id === id)?.kind === "connector";
  const hidden = (pin: Pin) => {
    const net = model.netByPin.get(pin.reference);
    if (
      view !== "schematic" ||
      !net ||
      net.kinds.length !== 1 ||
      !["power", "ground"].includes(net.kinds[0] ?? "")
    )
      return false;
    return !net.pins.some((p) => isConnector(p.split(".")[0] ?? ""));
  };
  const adjacency = new Map(model.modules.map((m) => [m.id, new Set<string>()]));
  for (const edge of model.edges) {
    const a = edge.from.split(".")[0] as string,
      b = edge.to.split(".")[0] as string;
    if (a !== b) {
      adjacency.get(a)?.add(b);
      adjacency.get(b)?.add(a);
    }
  }
  const byId = new Map(model.modules.map((m) => [m.id, m]));
  const distances = (start: string) => {
    const result = new Map([[start, 0]]),
      queue = [start];
    for (const id of queue)
      for (const next of adjacency.get(id) ?? [])
        if (!result.has(next)) {
          result.set(next, (result.get(id) ?? 0) + 1);
          queue.push(next);
        }
    return result;
  };
  const ranks = new Map<string, number>();
  for (const module of model.modules) {
    if (ranks.has(module.id)) continue;
    const group = [...distances(module.id).keys()];
    const ranked = group.map((id) => ({
      id,
      kind: byId.get(id)?.kind ?? "module",
      eccentricity: Math.max(...distances(id).values()),
      degree: adjacency.get(id)?.size ?? 0,
    }));
    ranked.sort((a, b) => {
      const sourceA = ["connector", "source", "sensor"].includes(a.kind) ? 0 : 1,
        sourceB = ["connector", "source", "sensor"].includes(b.kind) ? 0 : 1;
      return (
        sourceA - sourceB ||
        a.eccentricity - b.eccentricity ||
        b.degree - a.degree ||
        compare(a.id, b.id)
      );
    });
    for (const [id, rank] of distances(ranked[0]?.id ?? module.id)) ranks.set(id, rank);
  }
  const refCounts = new Map<string, number>();
  const nodes: Node[] = model.modules.map((module) => {
    const labelLines = wrap(module.label);
    const pins = model.pins.filter((p) => p.module.id === module.id);
    const top = pins.filter(
      (p) => hidden(p) && model.netByPin.get(p.reference)?.kinds[0] === "power",
    );
    const bottom = pins.filter(
      (p) => hidden(p) && model.netByPin.get(p.reference)?.kinds[0] === "ground",
    );
    const prefix = prefixes[module.kind],
      count = (refCounts.get(prefix) ?? 0) + 1;
    refCounts.set(prefix, count);
    const min =
      module.kind === "connector"
        ? 112
        : module.kind === "speaker"
          ? 156
          : module.kind === "controller"
            ? 268
            : 220;
    const pinWidth = Math.max(
      0,
      ...pins
        .filter((p) => !hidden(p))
        .map((p) => Math.max(width(p.port.label, 18), width(p.port.id, 14))),
    );
    const railWidth = Math.max(
      0,
      ...[top, bottom].map((rail) =>
        rail.length
          ? (Math.max(
              ...rail.map((p) => Math.max(width(netName(p), 16), width(p.port.label, 14))),
            ) +
              28) *
            (rail.length + 2)
          : 0,
      ),
    );
    return {
      module,
      rank: ranks.get(module.id) ?? 0,
      x: 0,
      y: 0,
      width: Math.ceil(
        Math.max(
          min,
          Math.max(...labelLines.map((value) => width(value, 22))) + 48,
          view === "blocks" || (module.kind === "connector" && module.ports.length === 1)
            ? 0
            : pinWidth * 2 + 70,
          railWidth,
        ),
      ),
      height: 100,
      contacts: [],
      top,
      bottom,
      reference: `${prefix}${count}`,
      labelLines,
      header: 80 + (labelLines.length - 1) * 26,
    };
  });
  const nodeById = new Map(nodes.map((n) => [n.module.id, n]));
  const inlineConnector = (node: Node) =>
    node.module.kind === "connector" && (adjacency.get(node.module.id)?.size ?? 0) === 1;
  const sortNode = (a: Node, b: Node) =>
    a.rank - b.rank ||
    order[a.module.kind] - order[b.module.kind] ||
    compare(a.module.id, b.module.id);
  nodes.sort(sortNode);
  const relations: Relation[] = [];
  for (const edge of model.edges) {
    let a = nodeById.get(edge.from.split(".")[0] ?? ""),
      b = nodeById.get(edge.to.split(".")[0] ?? "");
    if (!a || !b) reject("diagram.reference", "/connections", "Missing module.");
    if (sortNode(a, b) > 0) [a, b] = [b, a];
    let relation = relations.find((r) => r.a === a && r.b === b);
    if (!relation) {
      relation = { a, b, edges: [] };
      relations.push(relation);
    }
    relation.edges.push(edge);
  }
  relations.sort(
    (a, b) =>
      Math.max(a.a.rank, a.b.rank) - Math.max(b.a.rank, b.b.rank) ||
      sortNode(a.b, b.b) ||
      sortNode(a.a, b.a),
  );
  const layers = [...new Set(nodes.map((n) => n.rank))].sort((a, b) => a - b);
  let left = 24;
  for (const rank of layers) {
    const column = nodes.filter((n) => n.rank === rank);
    for (const node of column) node.x = left;
    const gap = column.every((n) => n.module.kind === "connector" || n.module.kind === "source")
      ? 100
      : rank === layers.at(-2) &&
          nodes
            .filter((n) => n.rank === rank + 1)
            .every((n) => n.module.kind === "speaker" || n.module.kind === "load")
        ? 150
        : 250;
    left += Math.max(...column.map((n) => n.width)) + gap;
  }
  const side = (node: Node, other: Node) => (other.rank < node.rank ? -1 : 1);
  const addContact = (
    node: Node,
    pin: Pin,
    edge: Edge | undefined,
    other: Node | undefined,
    y: number,
  ) => {
    const s = other ? side(node, other) : 1;
    const contact = { pin, edge, side: s, at: point(node.x + (s < 0 ? 0 : node.width), y) };
    node.contacts.push(contact);
    return contact;
  };
  if (view === "blocks") {
    const maxHeight = Math.max(
      140,
      ...layers.map((rank) => nodes.filter((n) => n.rank === rank).length * 180 - 80),
    );
    for (const rank of layers) {
      const column = nodes.filter((n) => n.rank === rank),
        h = column.length * 180 - 80;
      column.forEach((node, i) => {
        node.height = node.module.kind === "controller" ? 140 : 100;
        node.y = 180 + (maxHeight - h) / 2 + i * 180 + (100 - node.height) / 2;
      });
    }
    for (let pass = 0; pass < 3; pass++)
      for (const rank of [...layers].reverse()) {
        const column = nodes.filter((n) => n.rank === rank);
        for (const node of column) {
          const neighbors = [...(adjacency.get(node.module.id) ?? [])]
            .map((id) => nodeById.get(id))
            .filter(
              (n): n is Node =>
                !!n &&
                (n.rank > rank || node.module.kind === "speaker" || node.module.kind === "load"),
            );
          if (neighbors.length)
            node.y = Math.max(
              180,
              neighbors.reduce((s, n) => s + n.y + n.height / 2, 0) / neighbors.length -
                node.height / 2,
            );
        }
        column.sort((a, b) => a.y - b.y || sortNode(a, b));
        let end = 180;
        for (const node of column) {
          node.y = Math.max(end, node.y);
          end = node.y + node.height + 80;
        }
      }
  } else {
    let cursor = view === "schematic" ? 310 : 270;
    let deepest = -1;
    for (const relation of relations) {
      if (inlineConnector(relation.a) || inlineConnector(relation.b)) continue;
      let count = 0;
      const sorted = [...relation.edges].sort((a, b) => {
        const priority = (e: Edge) =>
          e.kind === "power" ? 0 : e.kind === "ground" ? 1 : e.kind === "signal" ? 2 : 3;
        return (
          priority(a) - priority(b) ||
          compare(a.bus ?? "", b.bus ?? "") ||
          compare(a.label ?? a.from, b.label ?? b.from) ||
          compare(a.id, b.id)
        );
      });
      const centerOnParent =
        relation.b.rank > deepest &&
        relation.a.rank < relation.b.rank &&
        relation.a.contacts.length > 0;
      const visibleCount = sorted.filter((edge) => {
        const pin = model.pinByReference.get(edge.from);
        return pin && !hidden(pin);
      }).length;
      const parentCenter =
        relation.a.contacts.reduce((sum, contact) => sum + contact.at.y, 0) /
        Math.max(1, relation.a.contacts.length);
      for (const edge of sorted) {
        const a = model.pinByReference.get(edge.from),
          b = model.pinByReference.get(edge.to);
        if (!a || !b || hidden(a)) continue;
        const first = nodeById.get(a.module.id) as Node,
          second = nodeById.get(b.module.id) as Node;
        const row = centerOnParent ? parentCenter + (count - (visibleCount - 1) / 2) * 56 : cursor;
        addContact(first, a, edge, second, row);
        addContact(second, b, edge, first, row + (first === second ? 56 : 0));
        if (!centerOnParent) cursor += first === second ? 112 : 56;
        count++;
      }
      if (count && !centerOnParent) cursor += view === "schematic" ? 168 : 120;
      deepest = Math.max(deepest, relation.b.rank);
    }
    for (const node of nodes) {
      const unconnected = model.pins.filter(
        (p) =>
          p.module.id === node.module.id &&
          !hidden(p) &&
          !node.contacts.some((c) => c.pin === p) &&
          !model.edges.some(
            (e) =>
              (e.from === p.reference || e.to === p.reference) &&
              (isConnector(e.from.split(".")[0] ?? "") || isConnector(e.to.split(".")[0] ?? "")),
          ),
      );
      let extra = Math.max(230, ...node.contacts.map((c) => c.at.y)) + 56;
      for (const pin of unconnected) {
        addContact(node, pin, undefined, undefined, extra);
        extra += 56;
      }
      const ys = node.contacts.map((c) => c.at.y);
      node.y = ys.length ? Math.min(...ys) - node.header : 230;
      node.height = ys.length ? Math.max(130, Math.max(...ys) - node.y + 52) : 140;
    }
    let conflicts = false;
    for (const rank of layers) {
      const column = nodes
        .filter((n) => n.rank === rank && !inlineConnector(n))
        .sort((a, b) => a.y - b.y);
      for (let i = 1; i < column.length; i++) {
        const a = column[i - 1],
          b = column[i];
        if (a && b && b.y < a.y + a.height + (view === "schematic" ? 84 : 24)) conflicts = true;
      }
    }
    if (conflicts)
      for (const rank of layers) {
        let y = 230;
        for (const node of nodes.filter((n) => n.rank === rank && !inlineConnector(n))) {
          node.y = y;
          const contacts = [...node.contacts].sort((a, b) => {
            const other = (c: Contact) =>
              c.edge
                ? nodeById.get(
                    (c.edge.from === c.pin.reference ? c.edge.to : c.edge.from).split(".")[0] ?? "",
                  )
                : undefined;
            return (
              (other(a)?.y ?? 0) - (other(b)?.y ?? 0) ||
              compare(a.pin.reference, b.pin.reference) ||
              compare(a.edge?.id ?? "", b.edge?.id ?? "")
            );
          });
          for (const s of [-1, 1])
            contacts
              .filter((c) => c.side === s)
              .forEach((c, i) => {
                c.at.y = y + node.header + i * 56;
              });
          node.height = Math.max(140, Math.max(0, ...contacts.map((c) => c.at.y)) - y + 52);
          y += node.height + 180;
        }
      }
    for (const relation of relations.filter((r) => inlineConnector(r.a) || inlineConnector(r.b))) {
      const connector = inlineConnector(relation.a) ? relation.a : relation.b;
      const other = connector === relation.a ? relation.b : relation.a;
      connector.height = Math.max(80, relation.edges.length * 56 + 48);
      connector.y = other.y + other.height / 2 - connector.height / 2;
      relation.edges.forEach((edge, i) => {
        const a = model.pinByReference.get(edge.from),
          b = model.pinByReference.get(edge.to);
        if (!a || !b) return;
        const y = connector.y + connector.height / 2 + (i - (relation.edges.length - 1) / 2) * 56;
        addContact(nodeById.get(a.module.id) as Node, a, edge, nodeById.get(b.module.id), y);
        addContact(nodeById.get(b.module.id) as Node, b, edge, nodeById.get(a.module.id), y);
      });
    }
  }
  const obstacles: Box[] = nodes.map((n) => ({
    x: n.x - 4,
    y: n.y - (view === "schematic" ? 76 : 4),
    width: n.width + 8,
    height: n.height + (view === "schematic" ? 156 : 8),
  }));
  const routeParts = new Map<string, Shape[]>(),
    pinParts = new Map<string, Shape[]>();
  const append = (map: Map<string, Shape[]>, id: string, shapes: Shape[]) =>
    map.set(id, [...(map.get(id) ?? []), ...shapes]);
  const tone = (edges: Edge[]): Shape["tone"] =>
    edges.every((e) => e.kind === "ground")
      ? "muted"
      : edges.every((e) => e.kind === "power")
        ? "positive"
        : edges.every((e) => e.kind === "audio")
          ? "ink"
          : "accent";
  const drawArrow = (points: Point[], atStart: boolean, color: Shape["tone"]): Shape => {
    const tip = atStart ? points[0] : points.at(-1),
      before = atStart ? points[1] : points.at(-2);
    if (!tip || !before)
      reject("diagram.routing", "/connections", "An arrow needs a nonempty route.");
    const d = Math.hypot(tip.x - before.x, tip.y - before.y),
      ux = (tip.x - before.x) / d,
      uy = (tip.y - before.y) / d;
    const head = polygon(
      [
        tip,
        point(tip.x - 9 * ux + 4 * uy, tip.y - 9 * uy - 4 * ux),
        point(tip.x - 9 * ux - 4 * uy, tip.y - 9 * uy + 4 * ux),
      ],
      color,
    );
    if (head.kind === "polygon") head.fill = color;
    return head;
  };
  const routes: Routed[] = [];
  const annotations: { id: string; points: Point[]; value: string; tone: Shape["tone"] }[] = [];
  if (view === "blocks") {
    for (const relation of relations) {
      const { a, b } = relation;
      const sy = Math.max(a.y + 24, Math.min(a.y + a.height - 24, b.y + b.height / 2));
      const ty = Math.max(b.y + 24, Math.min(b.y + b.height - 24, a.y + a.height / 2));
      const start = point(a.x + a.width, sy),
        end = point(b.x, ty);
      const color = tone(relation.edges);
      const route = routeBetween(start, end, 1, -1, obstacles, routes, "blocks");
      const routed = { points: route, net: "blocks" };
      routes.push(routed);
      for (const edge of relation.edges) append(routeParts, edge.id, [line(route, color)]);
      const primary =
        relation.edges.find((e) => e.kind === "signal" || e.kind === "audio") ?? relation.edges[0];
      if (primary) {
        const flows = relation.edges.filter((edge) => edge.kind === primary.kind);
        const both = flows.some((e) => e.direction === "both");
        const forward = flows.filter((e) => e.direction === "forward");
        if (both || forward.some((e) => e.arrowFrom?.split(".")[0] === a.module.id))
          append(routeParts, primary.id, [drawArrow(route, false, color)]);
        if (both || forward.some((e) => e.arrowFrom?.split(".")[0] === b.module.id))
          append(routeParts, primary.id, [drawArrow(route, true, color)]);
        const buses = [...new Set(relation.edges.flatMap((e) => (e.bus ? [e.bus] : [])))];
        const value = buses.length
          ? buses.join(" / ")
          : primary.kind === "power"
            ? "Power"
            : primary.kind === "audio"
              ? "Audio"
              : primary.kind === "ground"
                ? "Ground"
                : "Signal";
        annotations.push({ id: primary.id, points: route, value, tone: color });
      }
      for (const edge of relation.edges)
        for (const endpoint of [edge.from, edge.to]) {
          const pin = model.pinByReference.get(endpoint);
          if (!pin) continue;
          const at = pin.module.id === a.module.id ? start : end;
          append(pinParts, pin.target, [circle(at, 0.5, color, false)]);
        }
    }
  } else {
    const pending: { edge: Edge; route: Routed }[] = [];
    for (const edge of model.edges) {
      const first = model.pinByReference.get(edge.from),
        second = model.pinByReference.get(edge.to);
      if (!first || !second) continue;
      if (hidden(first)) continue;
      const a = nodeById
        .get(first.module.id)
        ?.contacts.find((c) => c.edge === edge && c.pin === first);
      const b = nodeById
        .get(second.module.id)
        ?.contacts.find((c) => c.edge === edge && c.pin === second);
      if (!a || !b)
        reject("diagram.routing", "/connections", "A declared connection has no contact.");
      const points = routeBetween(
        a.at,
        b.at,
        a.side,
        b.side,
        obstacles,
        routes,
        model.netByPin.get(first.reference)?.id ?? edge.id,
      );
      const routed = { points, net: model.netByPin.get(first.reference)?.id ?? edge.id };
      pending.push({ edge, route: routed });
      routes.push(routed);
    }
    pending.forEach(({ edge, route }, i) => {
      const color = tone([edge]);
      const points = bridgeCrossings(
        route,
        pending.slice(0, i).map((p) => p.route),
      );
      append(routeParts, edge.id, [line(points, color)]);
      onRoute?.(edge, points);
      if (
        (isConnector(edge.from.split(".")[0] ?? "") || isConnector(edge.to.split(".")[0] ?? "")) &&
        edge.direction === "forward"
      )
        append(routeParts, edge.id, [drawArrow(route.points, edge.arrowFrom === edge.to, color)]);
      if (view === "schematic" && edge.label && edge.kind !== "power")
        annotations.push({ id: edge.id, points: route.points, value: edge.label, tone: color });
    });
  }
  const railShapes = (
    node: Node,
    pin: Pin,
    index: number,
    list: Pin[],
    ground: boolean,
  ): Shape[] => {
    const x = node.x + ((index + (ground ? 2 : 1)) * node.width) / (list.length + 2),
      y = node.y + (ground ? node.height : 0),
      color: Shape["tone"] = ground ? "muted" : "positive";
    const shapes: Shape[] = [
      circle(point(x, y), 3, color, false),
      text(x, ground ? y - 28 : y + 10, pin.port.label, 14, "center"),
    ];
    if (ground) {
      shapes.push(line([point(x, y), point(x, y + 26)], color));
      for (let i = 0; i < 3; i++)
        shapes.push(
          line(
            [point(x - 12 + i * 4, y + 26 + i * 6), point(x + 12 - i * 4, y + 26 + i * 6)],
            color,
          ),
        );
      shapes.push(text(x + 20, y + 24, netName(pin), 14, "left", "muted"));
    } else {
      shapes.push(
        line([point(x, y), point(x, y - 26)], color),
        polygon([point(x, y - 32), point(x - 5, y - 23), point(x + 5, y - 23)], color),
        text(x, y - 58, netName(pin), 16, "center", color),
      );
    }
    return shapes;
  };
  for (const node of nodes) {
    const { module, x, y } = node;
    let shapes: Shape[] = [];
    if (view === "schematic" && module.kind === "speaker" && node.contacts.length === 2) {
      const contacts = [...node.contacts].sort((a, b) => a.at.y - b.at.y);
      const upper = contacts[0]?.at.y ?? y + 50,
        lower = contacts[1]?.at.y ?? y + 110;
      const coil = x + node.width / 2;
      shapes = [
        rect(point(coil, upper), 16, lower - upper),
        polygon([
          point(coil + 16, upper + 8),
          point(coil + 52, upper - 10),
          point(coil + 52, lower + 10),
          point(coil + 16, lower - 8),
        ]),
        line([point(x, upper), point(coil, upper)]),
        line([point(x, lower), point(coil, lower)]),
        text(coil + 20, upper - 38, node.reference, 16, "center"),
        ...node.labelLines.map((value, i) =>
          text(coil + 20, lower + 28 + i * 22, value, 18, "center"),
        ),
      ];
    } else {
      const box = rect(point(x, y), node.width, node.height);
      if (box.kind === "rect") box.radius = 0;
      shapes = [box];
      if (view === "blocks") {
        const powerLabels = [
          ...new Set(
            model.nets
              .filter(
                (n) =>
                  n.kinds.length === 1 &&
                  n.kinds[0] === "power" &&
                  n.pins.some((p) => p.startsWith(`${module.id}.`)),
              )
              .flatMap((n) =>
                n.labels.length === 1 && (n.labels[0]?.length ?? 0) < 16 ? n.labels : [],
              ),
          ),
        ];
        const incident = model.edges.filter(
          (edge) => edge.from.startsWith(`${module.id}.`) || edge.to.startsWith(`${module.id}.`),
        );
        const category =
          module.kind === "connector" &&
          incident.length > 0 &&
          incident.every((edge) => edge.kind === "power")
            ? "Power"
            : names[module.kind];
        const detail = [category, ...powerLabels].join(" · ");
        const extra = (node.labelLines.length - 1) * 13;
        shapes.push(
          ...node.labelLines.map((value, i) =>
            text(
              x + node.width / 2,
              y + node.height / 2 - (detail === module.label ? 11 : 24) - extra + i * 26,
              value,
              22,
              "center",
            ),
          ),
        );
        if (detail !== module.label)
          shapes.push(
            text(
              x + node.width / 2,
              y + node.height / 2 + 12 + extra,
              detail,
              15,
              "center",
              "muted",
            ),
          );
      } else if (module.kind === "connector" && module.ports.length === 1) {
        shapes.push(
          ...node.labelLines.map((value, i) =>
            text(
              x + node.width / 2,
              y + node.height / 2 - 11 - (node.labelLines.length - 1) * 13 + i * 26,
              value,
              22,
              "center",
            ),
          ),
        );
      } else {
        shapes.push(
          ...node.labelLines.map((value, i) =>
            text(x + node.width / 2, y + (node.top.length ? 40 : 18) + i * 26, value, 22, "center"),
          ),
        );
        if (view === "wiring")
          shapes.push(
            line(
              [point(x, y + node.header - 26), point(x + node.width, y + node.header - 26)],
              "muted",
            ),
          );
      }
      if (view === "schematic") shapes.push(text(x, y - 24, node.reference, 16));
    }
    display.push(part(`${model.document.id}/component/${module.id}`, shapes));
    targets.push({
      id: `${model.document.id}/component/${module.id}`,
      label: module.label,
      role: "component",
    });
    if (view !== "blocks") {
      for (const contact of node.contacts) {
        const color = contact.edge ? tone([contact.edge]) : "muted";
        const s: Shape[] = [circle(contact.at, 3, color, false)];
        if (module.kind !== "connector" || module.ports.length > 1) {
          const isSpeaker =
            view === "schematic" && module.kind === "speaker" && node.contacts.length === 2;
          const labelX = contact.at.x + (contact.side < 0 ? 18 : -18),
            align = contact.side < 0 ? "left" : "right";
          s.push(
            text(
              isSpeaker ? contact.at.x : labelX,
              contact.at.y +
                (isSpeaker
                  ? contact.at.y === Math.min(...node.contacts.map((c) => c.at.y))
                    ? -28
                    : 14
                  : -10),
              contact.pin.port.label,
              18,
              isSpeaker ? "center" : align,
            ),
          );
          if (contact.pin.port.id !== contact.pin.port.label)
            s.push(text(labelX, contact.at.y + 15, contact.pin.port.id, 14, align, "muted"));
        }
        append(pinParts, contact.pin.target, s);
      }
      for (const [list, ground] of [
        [node.top, false],
        [node.bottom, true],
      ] as const)
        list.forEach((pin, i) => {
          const shapes = railShapes(node, pin, i, list, ground);
          append(pinParts, pin.target, shapes);
          for (const edge of model.edges.filter(
            (e) => e.from === pin.reference || e.to === pin.reference,
          )) {
            const stem = shapes.find((s) => s.kind === "line");
            if (stem) append(routeParts, edge.id, [stem]);
          }
        });
    }
    for (const pin of model.pins.filter((p) => p.module.id === module.id))
      if (!pinParts.has(pin.target)) {
        append(pinParts, pin.target, [
          circle(point(x + node.width, y + node.height / 2), 0.5, "muted", false),
        ]);
      }
  }
  const labelBoxes: Box[] = [];
  for (const node of nodes)
    labelBoxes.push({
      x: node.x - 4,
      y: node.y - (view === "schematic" ? 76 : 4),
      width: node.width + 8,
      height: node.height + (view === "schematic" ? 156 : 8),
    });
  for (const annotation of annotations) {
    const w = width(annotation.value, view === "blocks" ? 17 : 14),
      h = 20;
    const segments = annotation.points
      .slice(1)
      .map((b, i) => ({ a: annotation.points[i] as Point, b }))
      .filter(({ a, b }) => a.y === b.y && Math.abs(a.x - b.x) > w + 24)
      .sort((a, b) => Math.abs(b.a.x - b.b.x) - Math.abs(a.a.x - a.b.x));
    let chosen: Box | undefined;
    for (const segment of segments)
      for (const delta of [-30, 12]) {
        const box = {
          x: (segment.a.x + segment.b.x - w) / 2,
          y: segment.a.y + delta,
          width: w,
          height: h,
        };
        const overlap = labelBoxes.some(
          (b) =>
            box.x < b.x + b.width &&
            box.x + box.width > b.x &&
            box.y < b.y + b.height &&
            box.y + box.height > b.y,
        );
        const crossed = routes.some((r) =>
          r.points.slice(1).some((b, i) => enters(r.points[i] as Point, b, box)),
        );
        if (box.y >= 146 && !overlap && !crossed) {
          chosen = box;
          break;
        }
      }
    if (chosen) {
      append(routeParts, annotation.id, [
        text(
          chosen.x,
          chosen.y,
          annotation.value,
          view === "blocks" ? 17 : 14,
          "left",
          annotation.tone,
        ),
      ]);
      labelBoxes.push(chosen);
    }
  }
  for (const pin of model.pins) {
    display.push(part(pin.target, pinParts.get(pin.target) ?? []));
    targets.push({ id: pin.target, label: pin.reference, role: "pin" });
  }
  for (const edge of model.edges) {
    const shapes = routeParts.get(edge.id);
    if (!shapes?.length)
      reject("diagram.routing", "/connections", "A declared connection was not drawn.");
    display.push(part(edge.id, shapes));
    targets.push({ id: edge.id, label: `${edge.from} ↔ ${edge.to}`, role: "route" });
  }
  for (const net of model.nets)
    targets.push({
      id: net.id,
      label: net.label,
      role: "net",
      kind: "group",
      members: [
        ...net.pins.map((p) => model.pinByReference.get(p)?.target ?? ""),
        ...net.connections,
      ],
    });
  const right = Math.max(
    1280,
    width(model.document.title, 16) + 48,
    ...nodes.map((n) => n.x + n.width + 32),
    ...routes.flatMap((r) => r.points.map((p) => p.x + 32)),
  );
  const bottom = Math.max(
    450,
    ...nodes.map((n) => n.y + n.height + (view === "schematic" ? 100 : 48)),
    ...routes.flatMap((r) => r.points.map((p) => p.y + 48)),
  );
  if (
    right > 9900 ||
    bottom + 100 > 9900 ||
    routes.some((r) => r.points.some((p) => p.x < -10000 || p.y < -10000))
  )
    reject(
      "diagram.layout-budget",
      "/modules",
      "The connected diagram exceeds the drawing budget; split the system into smaller diagrams.",
    );
  const frameLeft = Math.min(0, ...routes.flatMap((route) => route.points.map((p) => p.x - 24)));
  const outline = line(
    [
      point(frameLeft, 0),
      point(right, 0),
      point(right, bottom + 84),
      point(frameLeft, bottom + 84),
      point(frameLeft, 0),
    ],
    "muted",
  );
  if (outline.kind === "line") outline.width = 0.5;
  display.unshift(part(`${model.document.id}/frame`, [outline]));
  const title =
    view === "blocks"
      ? "Block diagram"
      : view === "wiring"
        ? "Wiring diagram"
        : "Modular schematic";
  const detail =
    view === "blocks"
      ? "Functional modules and grouped buses; arrows describe authored flow, not simulated current."
      : view === "wiring"
        ? "Pin-to-pin connections. Repeated pin labels denote the same terminal; positions are symbolic."
        : "Module-level nets. Matching rail labels connect; module internals remain unknown.";
  display.unshift(
    part(`${model.document.id}/heading`, [
      text(
        24,
        20,
        `${view === "blocks" ? "01 / BLOCKS" : view === "wiring" ? "02 / WIRING" : "03 / MODULAR SCHEMATIC"}`,
        14,
        "left",
        "accent",
      ),
      text(24, 48, title, 27),
      text(24, 94, model.document.title, 16, "left", "muted"),
      line([point(24, 126), point(right - 24, 126)], "muted"),
    ]),
  );
  display.push(
    part(`${model.document.id}/notes`, [
      text(
        24,
        bottom,
        "Checked: declared references and consistent net membership across views.",
        14,
        "left",
        "muted",
      ),
      text(24, bottom + 25, detail, 14, "left", "muted"),
      text(
        24,
        bottom + 50,
        "Unverified: electrical operation, voltage compatibility and physical pinout. Crossings do not connect.",
        14,
        "left",
        "muted",
      ),
    ]),
  );
  return {
    schema: "circuitkit.educational.public.v2",
    id: model.document.id,
    title: model.document.title,
    description:
      "Connected module diagram. Each module is drawn once. Repeated pin labels denote one terminal; matching rail labels denote one declared net. Crossings do not connect. No electrical, internal-circuit or physical-pinout verification.",
    theme,
    display,
    targets,
  };
}
