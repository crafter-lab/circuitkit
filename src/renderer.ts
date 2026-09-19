import { annotationHaloWidth, conductorPath, resolveAnnotations } from "./annotations.ts";
import { createComplexScene } from "./complex-scenes.ts";
import type { Label, Point, Scene } from "./scene.ts";
import { componentPins, type FigureDocument } from "./schema.ts";
import { resolveTheme, type Theme } from "./theme.ts";
import type { Box, Diagnostic, Failure, FigureBounds, FigureInfo, RenderResult } from "./types.ts";
import { escapeXML, number, textPath } from "./typography.ts";
import { jsonPointer, validateDocument } from "./validation.ts";

export const rendererVersion = "0.1.0";

export type SchematicComposition = "classic" | "compact";
export interface SchematicOptions {
  annotations?: boolean;
  composition?: SchematicComposition;
}
export type SchematicRenderResult =
  | (FigureInfo & { svg: string; endpoints?: Scene["endpoints"] })
  | Failure;

const compactRecipes = new Set(["rc-lowpass", "inverting-amplifier", "bridge-rectifier"]);

export function resolveSchematicComposition(
  document: FigureDocument,
  requested?: SchematicComposition,
): SchematicComposition {
  return requested ?? (compactRecipes.has(document.layout.preset) ? "compact" : "classic");
}

export function formatSI(value: number, unit: string): string {
  const prefixes: [number, string][] = [
    [1e9, "G"],
    [1e6, "M"],
    [1e3, "k"],
    [1, ""],
    [1e-3, "m"],
    [1e-6, "µ"],
    [1e-9, "n"],
    [1e-12, "p"],
  ];
  const prefix = prefixes.find(([scale]) => value >= scale);
  if (!prefix || value >= 1e12) return `${value.toExponential(3)} ${unit}`;
  return `${Number((value / prefix[0]).toPrecision(4))} ${prefix[1]}${unit}`;
}

function cutoffFrequency(resistance: number, capacitance: number) {
  const product = resistance * capacitance;
  return Number.isFinite(product) && product > 0
    ? 1 / (2 * Math.PI) / product
    : Math.exp(-Math.log(2 * Math.PI) - Math.log(resistance) - Math.log(capacitance));
}

function dividerRatio(top: number, bottom: number) {
  return top > bottom ? bottom / top / (1 + bottom / top) : 1 / (1 + top / bottom);
}

function componentValue(component: FigureDocument["circuit"]["components"][string]) {
  switch (component.type) {
    case "resistor":
      return formatSI(component.resistance, "Ω");
    case "capacitor":
      return formatSI(component.capacitance, "F");
    case "dc-source":
      return formatSI(component.voltage, "V");
    case "led":
      return "LED";
    case "diode":
      return "Diode";
    case "npn":
      return "NPN";
    case "op-amp":
      return "Ideal op-amp";
  }
}

function createScene(
  document: FigureDocument,
  composition: SchematicComposition = "classic",
): Scene {
  const compact = composition === "compact";
  const complex = createComplexScene(document, formatSI, compact);
  if (complex) return complex;
  const scene: Scene = {
    routes: [],
    symbols: [],
    dots: [],
    terminals: [],
    labels: [],
    endpoints: Object.create(null),
  };
  const { components, nets } = document.circuit;
  const roles = document.layout.roles;
  const id = (role: string) => {
    const value = roles[role];
    if (value === undefined) throw new Error(`Missing validated role ${role}`);
    return value;
  };
  const netAt = (endpoint: string) => {
    const found = Object.entries(nets).find(([, endpoints]) => endpoints.includes(endpoint));
    if (!found) throw new Error(`Missing validated endpoint ${endpoint}`);
    return found[0];
  };
  const endpoint = (name: string, point: Point) => {
    scene.endpoints[name] = { x: point[0], y: point[1], net: netAt(name) };
  };
  const route = (name: string, points: Point[]) => scene.routes.push({ net: netAt(name), points });
  const lead = (name: string, boundary: Point) => {
    const outer = scene.endpoints[name];
    if (!outer) throw new Error(`Missing lead endpoint ${name}`);
    scene.leads ??= [];
    scene.leads.push({ endpoint: name, points: [[outer.x, outer.y], boundary] });
  };
  const label = (key: string, text: string, x: number, y: number, options: Partial<Label> = {}) =>
    scene.labels.push({
      id: key,
      text,
      x,
      y,
      size: 20,
      family: "mono",
      align: "left",
      token: "label",
      region: "scene",
      ...options,
    });
  const symbol = (name: string, paths: string[], box: Box, gap: number) =>
    scene.symbols.push({ id: name, paths, box, gap });
  const componentLabel = (name: string, x: number, y: number, align: Label["align"] = "left") => {
    const component = components[name];
    if (!component) throw new Error("Missing validated component");
    label(`${name}:id`, name, x, y, { size: 18, token: "muted", align });
    label(`${name}:value`, componentValue(component), x, y + 28, { size: 24, align });
  };
  const resistor = (name: string, vertical: boolean) => {
    if (vertical) {
      endpoint(`${name}.a`, [600, 320]);
      endpoint(`${name}.b`, [600, 414]);
      lead(`${name}.a`, [600, 334]);
      lead(`${name}.b`, [600, 400]);
      symbol(
        name,
        ["M600 320V334M586 334H614V400H586ZM600 400V414"],
        { x: 586, y: 320, width: 28, height: 94 },
        28,
      );
      componentLabel(name, 650, 348);
    } else {
      const x = compact ? 300 : 375;
      endpoint(`${name}.a`, [x - 70, 270]);
      endpoint(`${name}.b`, [x + 70, 270]);
      lead(`${name}.a`, [x - 50, 270]);
      lead(`${name}.b`, [x + 50, 270]);
      symbol(
        name,
        [`M${x - 70} 270H${x - 50}M${x - 50} 256H${x + 50}V284H${x - 50}ZM${x + 50} 270H${x + 70}`],
        { x: x - 70, y: 256, width: 140, height: 28 },
        28,
      );
      componentLabel(name, x, compact ? 220 : 207, "center");
    }
  };
  const ground = (name: string, x: number, y: number, lead = 0) => {
    endpoint(name, [x, y]);
    if (lead > 0) {
      scene.leads ??= [];
      scene.leads.push({
        endpoint: name,
        points: [
          [x, y],
          [x, y + lead],
        ],
      });
    }
    symbol(
      name,
      [
        `M${x} ${y}V${y + lead}M${x - 19} ${y + lead}H${x + 19}M${x - 12} ${y + lead + 8}H${x + 12}M${x - 5} ${y + lead + 16}H${x + 5}`,
      ],
      { x: x - 19, y, width: 38, height: lead + 16 },
      8,
    );
    label(`${name}:port`, name, x + 50, y + lead + 10, { size: 17, token: "muted" });
  };
  const terminal = (name: string, point: Point) => {
    endpoint(name, point);
    scene.terminals.push({ id: name, net: netAt(name), point });
    label(`${name}:port`, name, point[0], point[1] - 34, { size: 20, align: "center" });
  };
  label("title", document.presentation.title, 64, 82, {
    size: 34,
    family: "sans",
    region: "header",
  });
  const subtitles = {
    "rc-lowpass": "First-order passive low-pass filter",
    "voltage-divider": "Two resistors. One ideal, unloaded ratio.",
    "led-series": "A DC source, a current-limiting resistor and an LED.",
  };
  label("subtitle", subtitles[document.layout.preset as keyof typeof subtitles], 64, 115, {
    size: 15,
    family: "sans",
    token: "muted",
    region: "header",
  });
  if (document.layout.preset === "led-series") {
    const supply = id("supply");
    const series = id("resistor");
    const led = id("led");
    resistor(series, false);
    endpoint(`${supply}.positive`, [180, 300]);
    endpoint(`${supply}.negative`, [180, 400]);
    lead(`${supply}.positive`, [180, 318]);
    lead(`${supply}.negative`, [180, 382]);
    symbol(
      supply,
      [
        "M180 300V318M180 382V400",
        "M180 318A32 32 0 1 1 180 382A32 32 0 1 1 180 318",
        "M172 338H188M180 330V346M172 364H188",
      ],
      { x: 148, y: 300, width: 64, height: 100 },
      16,
    );
    componentLabel(supply, 250, 342);
    endpoint(`${led}.anode`, [650, 310]);
    endpoint(`${led}.cathode`, [650, 390]);
    lead(`${led}.anode`, [650, 329]);
    lead(`${led}.cathode`, [650, 358]);
    symbol(
      led,
      [
        "M650 310V329M634 329H666L650 358ZM632 358H668M650 358V390",
        "M675 343L695 323M685 323H695V333M684 358L704 338M694 338H704V348",
      ],
      { x: 632, y: 310, width: 72, height: 80 },
      16,
    );
    componentLabel(led, 744, 338);
    ground(id("ground"), 440, 440, 8);
    route(`${supply}.positive`, [
      [180, 300],
      [180, 270],
      [305, 270],
    ]);
    route(`${series}.b`, [
      [445, 270],
      [650, 270],
      [650, 310],
    ]);
    route(`${led}.cathode`, [
      [650, 390],
      [650, 440],
      [180, 440],
      [180, 400],
    ]);
    scene.dots.push({ net: netAt(id("ground")), point: [440, 440] });
    label("formula", "Drawing values only", 64, 535, {
      size: 23,
      family: "sans",
      region: "footer",
    });
    label(
      "assumption",
      "LED forward voltage and current are not assumed. This is not a validated physical design.",
      64,
      566,
      { size: 14, family: "sans", token: "muted", region: "footer" },
    );
  } else {
    const rc = document.layout.preset === "rc-lowpass";
    const series = id(rc ? "series" : "top");
    const shunt = id(rc ? "shunt" : "bottom");
    resistor(series, false);
    const shuntX = compact ? 440 : 600;
    const capacitorY = compact ? 340 : 355;
    const outputX = compact ? 620 : 820;
    const groundY = compact ? 404 : 438;
    terminal(id("input"), [180, 270]);
    terminal(id("output"), [outputX, 270]);
    const shuntTop: Point = rc ? [shuntX, capacitorY - 28] : [600, 320];
    const shuntBottom: Point = rc ? [shuntX, capacitorY + 28] : [600, 414];
    if (rc) {
      endpoint(`${shunt}.a`, shuntTop);
      endpoint(`${shunt}.b`, shuntBottom);
      lead(`${shunt}.a`, [shuntX, capacitorY - 10]);
      lead(`${shunt}.b`, [shuntX, capacitorY + 10]);
      symbol(
        shunt,
        [
          `M${shuntX} ${capacitorY - 28}V${capacitorY - 10}M${shuntX - 24} ${capacitorY - 10}H${shuntX + 24}M${shuntX - 24} ${capacitorY + 10}H${shuntX + 24}M${shuntX} ${capacitorY + 10}V${capacitorY + 28}`,
        ],
        { x: shuntX - 24, y: capacitorY - 28, width: 48, height: 56 },
        20,
      );
      componentLabel(shunt, shuntX + 50, capacitorY - 12);
    } else resistor(shunt, true);
    ground(id("ground"), shuntX, groundY);
    route(id("input"), [
      [180, 270],
      [compact ? 230 : 305, 270],
    ]);
    route(id("output"), [
      [compact ? 370 : 445, 270],
      [shuntX, 270],
      [outputX, 270],
    ]);
    route(id("output"), [[shuntX, 270], shuntTop]);
    route(id("ground"), [shuntBottom, [shuntX, groundY]]);
    scene.dots.push({ net: netAt(id("output")), point: [shuntX, 270] });
    const top = components[series];
    const bottom = components[shunt];
    if (rc && top?.type === "resistor" && bottom?.type === "capacitor") {
      const cutoff = cutoffFrequency(top.resistance, bottom.capacitance);
      const displayed =
        cutoff >= 1 && cutoff < 1000 ? `${Math.round(cutoff)} Hz` : formatSI(cutoff, "Hz");
      label("formula", `fc = 1/(2πRC) = ${displayed}`, 64, 535, { size: 23, region: "footer" });
      label(
        "assumption",
        "Ideal first-order model. Not a simulation or an electrical-safety assessment.",
        64,
        566,
        { size: 14, family: "sans", token: "muted", region: "footer" },
      );
    } else if (top?.type === "resistor" && bottom?.type === "resistor") {
      const ratio = dividerRatio(top.resistance, bottom.resistance);
      label(
        "formula",
        `VOUT/VIN = Rbottom/(Rtop+Rbottom) = ${Number(ratio.toPrecision(4))}`,
        64,
        535,
        { size: 20, region: "footer" },
      );
      label(
        "assumption",
        "Ideal, unloaded voltage divider. A connected load changes this ratio.",
        64,
        566,
        { size: 14, family: "sans", token: "muted", region: "footer" },
      );
    }
  }
  return scene;
}

const expand = (box: Box, padding: number): Box => ({
  x: box.x - padding,
  y: box.y - padding,
  width: box.width + padding * 2,
  height: box.height + padding * 2,
});
const overlaps = (a: Box, b: Box) =>
  a.width > 0 &&
  a.height > 0 &&
  b.width > 0 &&
  b.height > 0 &&
  a.x < b.x + b.width &&
  a.x + a.width > b.x &&
  a.y < b.y + b.height &&
  a.y + a.height > b.y;
const finiteBox = (box: Box) => Object.values(box).every(Number.isFinite);

export function deriveStepPresentation(
  presentation: FigureDocument["presentation"],
): FigureDocument["presentation"] {
  const step = presentation.steps?.find(({ id }) => id === presentation.activeStep);
  if (!step) return presentation;
  const { activeStep: _activeStep, ...authored } = presentation;
  return {
    ...authored,
    highlight: { components: [...step.highlight.components], nets: [...step.highlight.nets] },
    annotations: {
      nets: presentation.annotations?.nets ?? [],
      legend: presentation.annotations?.legend ?? false,
      caption: [presentation.annotations?.caption, `${step.title}: ${step.description}`.trim()]
        .filter(Boolean)
        .join(" "),
    },
  };
}

function schematicBounds(
  scene: Scene,
  theme: Theme,
  measured: FigureBounds,
  components: Set<string>,
  nets: Set<string>,
  annotated: Set<string>,
): FigureBounds {
  const bounds: FigureBounds = {
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    labels: Object.create(null),
    symbols: Object.create(null),
    routes: Object.create(null),
  };
  const netStroke = (net: string) => theme.strokeWidth * (nets.has(net) ? 1.5 : 1);
  const add = (net: string, box: Box) => {
    bounds.routes[net] ??= [];
    bounds.routes[net].push(box);
  };
  const conductor = (net: string, points: Point[], stroke: number, butt: boolean) => {
    for (let index = 1; index < points.length; index++) {
      const a = points[index - 1];
      const b = points[index];
      if (!a || !b) continue;
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const px = butt ? (length ? ((Math.abs(b[1] - a[1]) / length) * stroke) / 2 : 0) : stroke / 2;
      const py = butt ? (length ? ((Math.abs(b[0] - a[0]) / length) * stroke) / 2 : 0) : stroke / 2;
      add(net, {
        x: Math.min(a[0], b[0]) - px,
        y: Math.min(a[1], b[1]) - py,
        width: Math.abs(b[0] - a[0]) + px * 2,
        height: Math.abs(b[1] - a[1]) + py * 2,
      });
    }
  };
  for (const symbol of scene.symbols) {
    const groundNet = scene.endpoints[symbol.id]?.net;
    const stroke =
      groundNet !== undefined && annotated.has(groundNet)
        ? netStroke(groundNet)
        : theme.strokeWidth * (components.has(symbol.id) ? 1.5 : 1);
    bounds.symbols[symbol.id] = expand(symbol.box, stroke / 2);
  }
  for (const route of scene.routes) {
    conductor(route.net, route.points, netStroke(route.net), false);
    if (annotated.has(route.net))
      conductor(route.net, route.points, annotationHaloWidth(theme), true);
  }
  for (const lead of scene.leads ?? []) {
    const net = scene.endpoints[lead.endpoint]?.net;
    if (net === undefined || !annotated.has(net)) continue;
    conductor(net, lead.points, netStroke(net), true);
    conductor(net, lead.points, annotationHaloWidth(theme), true);
  }
  for (const {
    net,
    point: [x, y],
  } of scene.dots)
    add(net, expand({ x, y, width: 0, height: 0 }, 4));
  for (const {
    net,
    point: [x, y],
  } of scene.terminals)
    add(net, expand({ x, y, width: 0, height: 0 }, 4 + netStroke(net) / 2));
  const sceneLabels = new Set(
    scene.labels.filter(({ region }) => region === "scene").map(({ id }) => id),
  );
  for (const [id, box] of Object.entries(measured.labels))
    if (sceneLabels.has(id) || (annotated.size > 0 && id.startsWith("annotation:")))
      bounds.labels[id] = box;
  const paint = [
    ...Object.values(bounds.labels),
    ...Object.values(bounds.symbols),
    ...Object.values(bounds.routes).flat(),
  ];
  bounds.x = Math.min(...paint.map(({ x }) => x)) - 16;
  bounds.y = Math.min(...paint.map(({ y }) => y)) - 16;
  bounds.width = Math.max(...paint.map(({ x, width }) => x + width)) + 16 - bounds.x;
  bounds.height = Math.max(...paint.map(({ y, height }) => y + height)) + 16 - bounds.y;
  return bounds;
}

function compile(
  authoredDocument: FigureDocument,
  mode: "figure" | "schematic" | "annotated-schematic" = "figure",
  composition: SchematicComposition = "classic",
) {
  const document = {
    ...authoredDocument,
    presentation: deriveStepPresentation(authoredDocument.presentation),
  };
  const { theme, diagnostics } = resolveTheme(document);
  const scene = createScene(document, composition);
  const frame = scene.frame ?? {
    width: 1000,
    height: 600,
    headerBottom: 144,
    footerTop: 490,
    sceneRegion: { x: 48, y: 169, width: 904, height: 303 },
  };
  const maximumStroke = theme.strokeWidth * 1.5;
  const padding = maximumStroke / 2;
  const bounds: FigureBounds = {
    x: 0,
    y: 0,
    width: frame.width,
    height: frame.height,
    labels: Object.create(null),
    symbols: Object.create(null),
    routes: Object.create(null),
  };
  const fail = (path: string, message: string, code = "layout.label_collision") =>
    diagnostics.push({ code, path, message });
  for (const symbol of scene.symbols) {
    bounds.symbols[symbol.id] = expand(symbol.box, padding);
    if (!Number.isFinite(maximumStroke) || maximumStroke >= symbol.gap)
      fail(
        "/presentation/theme/overrides/strokeWidth",
        `Stroke closes the reserved gap in ${symbol.id}. Reduce strokeWidth.`,
      );
  }
  for (const route of scene.routes) {
    const boxes = Object.hasOwn(bounds.routes, route.net) ? bounds.routes[route.net] : [];
    for (let index = 1; index < route.points.length; index++) {
      const a = route.points[index - 1];
      const b = route.points[index];
      if (!a || !b) continue;
      boxes?.push(
        expand(
          {
            x: Math.min(a[0], b[0]),
            y: Math.min(a[1], b[1]),
            width: Math.abs(b[0] - a[0]),
            height: Math.abs(b[1] - a[1]),
          },
          authoredDocument.presentation.annotations ? annotationHaloWidth(theme) / 2 : padding,
        ),
      );
    }
    Object.defineProperty(bounds.routes, route.net, {
      value: boxes,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  const labels: string[] = [];
  for (const label of scene.labels) {
    const text = textPath(
      label.text,
      label.family,
      label.size * theme.fontScale,
      label.x,
      label.y,
      label.align,
    );
    const path = label.id === "title" ? "/presentation/title" : `/layout/labels/${label.id}`;
    if (text.missing.length)
      fail(
        path,
        `Pinned Geist ${label.family} has no supported glyph for ${text.missing.map((character) => JSON.stringify(character)).join(", ")}.`,
        "font.missing_glyph",
      );
    const box = text.box;
    if (text.svg && (box.width <= 0 || box.height <= 0))
      fail(
        "/presentation/theme/overrides/fontScale",
        "fontScale collapses visible glyph geometry; use a representable scale.",
      );
    const region =
      label.region === "header"
        ? { x: 64, y: 36, width: frame.width - 128, height: 94 }
        : label.region === "footer"
          ? {
              x: 64,
              y: frame.footerTop + 16,
              width: frame.width - 128,
              height: frame.height - frame.footerTop - 34,
            }
          : frame.sceneRegion;
    if (
      !finiteBox(box) ||
      box.x < region.x ||
      box.x + box.width > region.x + region.width ||
      box.y < region.y ||
      box.y + box.height > region.y + region.height
    )
      fail(
        path,
        `Label ${JSON.stringify(label.text)} does not fit its ${label.region} area. Shorten the label or reduce fontScale.`,
      );
    for (const [otherId, otherBox] of Object.entries(bounds.labels))
      if (overlaps(box, otherBox))
        fail(path, `Label overlaps ${otherId}. Reduce fontScale or shorten IDs/title.`);
    if (label.region === "scene") {
      for (const [symbolId, symbolBox] of Object.entries(bounds.symbols))
        if (overlaps(box, symbolBox))
          fail(path, `Label overlaps symbol ${symbolId}. Reduce fontScale or shorten IDs.`);
      for (const [net, boxes] of Object.entries(bounds.routes))
        if (boxes.some((routeBox) => overlaps(box, routeBox)))
          fail(path, `Label overlaps net ${net}. Reduce fontScale or shorten IDs.`);
    }
    bounds.labels[label.id] = box;
    if (mode === "figure" || label.region === "scene")
      labels.push(
        `<g data-label="${escapeXML(label.id)}" fill="${theme[label.token]}">${text.svg}</g>`,
      );
  }
  const ids = [
    ...Object.keys(document.circuit.components),
    ...Object.keys(document.circuit.ports),
    ...Object.keys(document.circuit.nets),
  ];
  for (const value of [document.presentation.title, ...ids]) {
    if (
      [...value].some((char) => {
        const code = char.codePointAt(0) ?? 0;
        return (
          code < 32 || (code >= 0xd800 && code <= 0xdfff) || code === 0xfffe || code === 0xffff
        );
      })
    )
      fail(
        "/presentation",
        "Titles and IDs cannot contain XML control characters.",
        "document.invalid_field",
      );
  }
  if (!document.presentation.title.trim())
    fail("/presentation/title", "A nonempty figure title is required.", "document.invalid_field");
  if (document.layout.preset === "rc-lowpass") {
    const r = document.circuit.components[document.layout.roles.series ?? ""];
    const c = document.circuit.components[document.layout.roles.shunt ?? ""];
    if (r?.type === "resistor" && c?.type === "capacitor") {
      const frequency = cutoffFrequency(r.resistance, c.capacitance);
      if (!Number.isFinite(frequency) || frequency <= 0)
        fail(
          "/circuit/components",
          "RC frequency is outside finite positive floating-point range; use representable component values.",
          "document.invalid_field",
        );
    }
  }
  if (document.layout.preset === "voltage-divider") {
    const top = document.circuit.components[document.layout.roles.top ?? ""];
    const bottom = document.circuit.components[document.layout.roles.bottom ?? ""];
    if (top?.type === "resistor" && bottom?.type === "resistor") {
      const ratio = dividerRatio(top.resistance, bottom.resistance);
      if (!Number.isFinite(ratio) || ratio <= 0)
        fail(
          "/circuit/components",
          "Divider ratio is outside finite positive floating-point range; use representable component values.",
          "document.invalid_field",
        );
    }
  }
  const checkedAnnotations = resolveAnnotations(document, scene, theme, bounds, frame.sceneRegion);
  if (checkedAnnotations) diagnostics.push(...checkedAnnotations.diagnostics);
  if (diagnostics.length) return { ok: false as const, diagnostics };
  const resolved = mode === "schematic" ? undefined : checkedAnnotations;
  const highlightedComponents = new Set(document.presentation.highlight?.components);
  const highlightedNets = new Set(document.presentation.highlight?.nets);
  const annotationsByNet = new Map(
    resolved?.annotations.nets.map((annotation) => [annotation.net, annotation]),
  );
  const style = (selected: boolean) =>
    `stroke="${selected ? theme.highlight : theme.wire}" stroke-width="${number(selected ? maximumStroke : theme.strokeWidth)}"`;
  const netColor = (net: string) =>
    annotationsByNet.get(net)?.color ?? (highlightedNets.has(net) ? theme.highlight : theme.wire);
  const netStyle = (net: string) =>
    `stroke="${netColor(net)}" stroke-width="${number(highlightedNets.has(net) ? maximumStroke : theme.strokeWidth)}"`;
  const halos = (resolved?.annotations.nets ?? [])
    .map(
      (annotation) =>
        `<g data-net-halo="${escapeXML(annotation.net)}" stroke="${annotation.color}" stroke-width="${number(annotationHaloWidth(theme))}" stroke-opacity="${highlightedNets.has(annotation.net) ? "0.24" : "0.1"}" stroke-linecap="butt">${annotation.paths.map((d) => `<path d="${d}"/>`).join("")}</g>`,
    )
    .join("");
  const wires = scene.routes
    .map(
      (route) =>
        `<path data-net="${escapeXML(route.net)}" d="${route.points.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x} ${y}`).join("")}" ${netStyle(route.net)}/>`,
    )
    .join("");
  const symbols = scene.symbols
    .map((symbol) => {
      const groundNet =
        Object.hasOwn(document.circuit.ports, symbol.id) &&
        document.circuit.ports[symbol.id]?.kind === "ground"
          ? scene.endpoints[symbol.id]?.net
          : undefined;
      const symbolStyle =
        groundNet !== undefined && annotationsByNet.has(groundNet)
          ? netStyle(groundNet)
          : style(highlightedComponents.has(symbol.id));
      return `<g data-component="${escapeXML(symbol.id)}" ${symbolStyle}>${symbol.paths.map((d) => `<path d="${d}"/>`).join("")}${(symbol.filledPaths ?? []).map((d) => `<path d="${d}" fill="${highlightedComponents.has(symbol.id) ? theme.highlight : theme.wire}" stroke="none"/>`).join("")}</g>`;
    })
    .join("");
  const leads = (scene.leads ?? [])
    .map((lead) => {
      const net = scene.endpoints[lead.endpoint]?.net;
      return net !== undefined && annotationsByNet.has(net)
        ? `<path data-net="${escapeXML(net)}" data-pin-lead="${escapeXML(lead.endpoint)}" d="${conductorPath(lead.points)}" ${netStyle(net)} stroke-linecap="butt"/>`
        : "";
    })
    .join("");
  const dots = scene.dots
    .map(
      ({ net, point: [x, y] }) =>
        `<circle data-junction="${escapeXML(net)}" cx="${x}" cy="${y}" r="4" fill="${netColor(net)}" stroke="none"/>`,
    )
    .join("");
  const terminals = scene.terminals
    .map(
      ({ id, net, point: [x, y] }) =>
        `<circle data-terminal="${escapeXML(id)}" cx="${x}" cy="${y}" r="4" fill="${theme.background}" ${netStyle(net)}/>`,
    )
    .join("");
  const description = [
    document.presentation.title,
    ...Object.entries(document.circuit.components).map(
      ([id, component]) => `${id}: ${component.type}, ${componentValue(component)}`,
    ),
    ...Object.entries(document.circuit.nets).map(
      ([id, endpoints]) => `${id}: ${endpoints.join(" connected to ")}`,
    ),
    ...scene.labels
      .filter((label) => mode === "figure" && label.region === "footer")
      .map((label) => label.text),
    `Focus components: ${[...highlightedComponents].join(", ") || "none"}. Focus nets: ${[...highlightedNets].join(", ") || "none"}.`,
    ...(resolved
      ? [
          ...resolved.annotations.nets.map(
            ({ net, label, description }) => `${label} (${net}): ${description}`,
          ),
          mode === "figure" ? resolved.annotations.caption : "",
        ].filter(Boolean)
      : []),
  ].join(". ");
  const viewport =
    mode === "figure"
      ? bounds
      : schematicBounds(
          scene,
          theme,
          bounds,
          highlightedComponents,
          highlightedNets,
          new Set(annotationsByNet.keys()),
        );
  if (
    ![viewport.x, viewport.y, viewport.width, viewport.height].every(Number.isFinite) ||
    viewport.width <= 0 ||
    viewport.height <= 0
  ) {
    fail(
      "/layout",
      "Painted schematic bounds must be finite and positive.",
      "layout.invalid_bounds",
    );
    return { ok: false as const, diagnostics };
  }
  const svg =
    mode !== "figure"
      ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewport.x} ${viewport.y} ${viewport.width} ${viewport.height}" width="${viewport.width}" height="${viewport.height}" role="img" aria-label="${escapeXML(description)}"><title>${escapeXML(document.presentation.title)}</title><desc>${escapeXML(description)}</desc><g aria-hidden="true"><rect x="${viewport.x}" y="${viewport.y}" width="${viewport.width}" height="${viewport.height}" fill="${theme.background}"/><g fill="none" stroke-linecap="round" stroke-linejoin="round">${halos}${wires}${symbols}${leads}${dots}${terminals}</g>${labels.join("")}${resolved?.labels ?? ""}</g></svg>`
      : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${frame.width} ${frame.height}" width="${frame.width}" height="${frame.height}" role="img" aria-label="${escapeXML(description)}"><title>${escapeXML(document.presentation.title)}</title><desc>${escapeXML(description)}</desc><g aria-hidden="true"><path d="M0 0H${frame.width}V${frame.height}H0Z" fill="${theme.background}"/><path d="M64 ${frame.headerBottom}H${frame.width - 64}M64 ${frame.footerTop}H${frame.width - 64}" fill="none" stroke="${theme.border}" stroke-width="1"/><g fill="none" stroke-linecap="round" stroke-linejoin="round">${halos}${wires}${symbols}${leads}${dots}${terminals}</g>${labels.join("")}${resolved?.labels ?? ""}</g></svg>`;
  return {
    ok: true as const,
    svg,
    bounds: viewport,
    endpoints: scene.endpoints,
    diagnostics,
    ...(resolved ? { annotations: resolved.annotations } : {}),
  };
}

export function renderSVG(input: unknown): RenderResult {
  const validation = validateDocument(input);
  if (!validation.ok) return validation;
  const compiled = compile(validation.document);
  if (!compiled.ok) return compiled;
  return {
    ok: true,
    svg: compiled.svg,
    diagnostics: [],
    document: validation.document,
    circuit: validation.document.circuit,
    bounds: compiled.bounds,
    ...(compiled.annotations ? { annotations: compiled.annotations } : {}),
    rendererVersion,
  };
}

export function renderSchematicSVG(
  input: unknown,
  options: SchematicOptions = {},
): SchematicRenderResult {
  if (
    options === null ||
    typeof options !== "object" ||
    Array.isArray(options) ||
    Reflect.ownKeys(options).some((key) => key !== "annotations" && key !== "composition") ||
    (options.annotations !== undefined && typeof options.annotations !== "boolean") ||
    (options.composition !== undefined &&
      options.composition !== "classic" &&
      options.composition !== "compact")
  )
    return {
      ok: false,
      diagnostics: [
        {
          code: "schematic.invalid_options",
          path: "/options",
          message: 'Expected only annotations (boolean) and composition ("classic" or "compact").',
        },
      ],
    };
  const validation = validateDocument(input);
  if (!validation.ok) return validation;
  if (options.composition === "compact" && !compactRecipes.has(validation.document.layout.preset))
    return {
      ok: false,
      diagnostics: [
        {
          code: "schematic.unsupported_composition",
          path: "/options/composition",
          message:
            "Compact composition supports rc-lowpass, inverting-amplifier and bridge-rectifier only. Use classic for this recipe.",
        },
      ],
    };
  const compiled = compile(
    validation.document,
    options.annotations ? "annotated-schematic" : "schematic",
    resolveSchematicComposition(validation.document, options.composition),
  );
  if (!compiled.ok) return compiled;
  return {
    ok: true,
    endpoints: compiled.endpoints,
    svg: compiled.svg,
    diagnostics: [],
    document: validation.document,
    circuit: validation.document.circuit,
    bounds: compiled.bounds,
    ...(compiled.annotations ? { annotations: compiled.annotations } : {}),
    rendererVersion,
  };
}

export function inspect(input: unknown) {
  const validation = validateDocument(input);
  if (!validation.ok) return validation;
  const compiled = compile(validation.document);
  if (!compiled.ok) return compiled;
  const document = validation.document;
  return {
    ok: true as const,
    diagnostics: [] as Diagnostic[],
    rendererVersion,
    version: document.version,
    document,
    circuit: document.circuit,
    components: document.circuit.components,
    terminals: document.circuit.ports,
    nets: document.circuit.nets,
    roles: document.layout.roles,
    bounds: compiled.bounds,
    ...(compiled.annotations ? { annotations: compiled.annotations } : {}),
    endpoints: compiled.endpoints,
    pins: Object.fromEntries(
      Object.entries(document.circuit.components).map(([id, component]) => [
        id,
        componentPins[component.type],
      ]),
    ),
  };
}

export function validate(input: unknown) {
  const result = inspect(input);
  if (!result.ok) return result;
  return {
    ok: true as const,
    diagnostics: result.diagnostics,
    document: result.document,
    circuit: result.circuit,
    bounds: result.bounds,
    ...(result.annotations ? { annotations: result.annotations } : {}),
    rendererVersion,
  };
}

export function defineFigure<T extends FigureDocument>(document: T): T {
  return document;
}
export { jsonPointer };
