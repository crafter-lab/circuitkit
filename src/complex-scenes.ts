import { complexRecipes } from "./complex-recipes.ts";
import type { Label, Point, Scene } from "./scene.ts";
import { complexRecipeIds, type FigureDocument } from "./schema.ts";

export function createComplexScene(
  document: FigureDocument,
  formatSI: (value: number, unit: string) => string,
): Scene | null {
  const preset = document.layout.preset;
  if (!complexRecipeIds.some((id) => id === preset)) return null;
  const recipe = complexRecipes[preset as keyof typeof complexRecipes];
  const width =
    preset === "bridge-rectifier"
      ? 1700
      : preset === "inverting-amplifier"
        ? 1600
        : preset === "transistor-switch"
          ? 1500
          : 1400;
  const height =
    preset === "inverting-amplifier" || preset === "transistor-switch"
      ? 1200
      : preset === "bridge-rectifier"
        ? 1120
        : preset === "wheatstone-bridge"
          ? 1100
          : 1000;
  const footerTop = height - 110;
  const scene: Scene = {
    routes: [],
    symbols: [],
    dots: [],
    terminals: [],
    labels: [],
    endpoints: Object.create(null),
    frame: {
      width,
      height,
      headerBottom: 144,
      footerTop,
      sceneRegion: { x: 64, y: 180, width: width - 128, height: footerTop - 204 },
    },
  };
  const id = (role: string) => {
    const value = document.layout.roles[role];
    if (value === undefined) throw new Error(`Missing validated role ${role}`);
    return value;
  };
  const name = (reference: string) => {
    const [role, pin] = reference.split(".");
    return `${id(role ?? "")}${pin ? `.${pin}` : ""}`;
  };
  const netAt = (endpoint: string) => {
    const net = Object.entries(document.circuit.nets).find(([, pins]) => pins.includes(endpoint));
    if (!net) throw new Error(`Missing validated endpoint ${endpoint}`);
    return net[0];
  };
  const endpoint = (reference: string, point: Point) => {
    const key = name(reference);
    scene.endpoints[key] = { x: point[0], y: point[1], net: netAt(key) };
  };
  const lead = (reference: string, boundary: Point) => {
    const key = name(reference);
    const outer = scene.endpoints[key];
    if (!outer) throw new Error(`Missing lead endpoint ${key}`);
    scene.leads ??= [];
    scene.leads.push({ endpoint: key, points: [[outer.x, outer.y], boundary] });
  };
  const wire = (reference: string, ...points: Point[]) =>
    scene.routes.push({ net: netAt(name(reference)), points });
  const dot = (reference: string, point: Point) =>
    scene.dots.push({ net: netAt(name(reference)), point });
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
  const componentLabel = (role: string, x: number, y: number, align: Label["align"] = "left") => {
    const key = id(role);
    const component = document.circuit.components[key];
    if (!component) throw new Error(`Missing validated component ${key}`);
    const value =
      component.type === "resistor"
        ? formatSI(component.resistance, "Ω")
        : component.type === "capacitor"
          ? formatSI(component.capacitance, "F")
          : component.type === "dc-source"
            ? formatSI(component.voltage, "V")
            : component.type === "npn"
              ? "NPN"
              : component.type === "op-amp"
                ? "Ideal op-amp"
                : component.type === "led"
                  ? "LED"
                  : "Diode";
    label(`${key}:id`, key, x, y, { size: 18, token: "muted", align });
    label(`${key}:value`, value, x, y + 28, { size: 24, align });
  };
  const terminal = (
    role: string,
    point: Point,
    position: Point = [point[0], point[1] - 34],
    align: Label["align"] = "center",
  ) => {
    endpoint(role, point);
    scene.terminals.push({ id: id(role), net: netAt(name(role)), point });
    label(`${id(role)}:port`, id(role), position[0], position[1], { align });
  };
  const ground = (role: string, x: number, y: number) => {
    endpoint(role, [x, y]);
    lead(role, [x, y + 12]);
    scene.symbols.push({
      id: id(role),
      paths: [
        `M${x} ${y}V${y + 12}M${x - 19} ${y + 12}H${x + 19}M${x - 12} ${y + 20}H${x + 12}M${x - 5} ${y + 28}H${x + 5}`,
      ],
      box: { x: x - 19, y, width: 38, height: 28 },
      gap: 8,
    });
    label(`${id(role)}:port`, id(role), x + 50, y + 20, { size: 17, token: "muted" });
  };
  const twoPin = (
    role: string,
    x: number,
    y: number,
    direction: "right" | "down" | "up",
    labelAt: Point,
    align: Label["align"] = "left",
  ) => {
    const component = document.circuit.components[id(role)];
    if (!component) throw new Error(`Missing validated component ${id(role)}`);
    const project = ([a, b]: Point): Point =>
      direction === "right"
        ? [x + a, y + b]
        : direction === "down"
          ? [x - b, y + a]
          : [x + b, y - a];
    const localPoints: Point[] = [];
    const path = (points: Point[], close = false) => {
      localPoints.push(...points);
      return (
        points.map((point, i) => `${i === 0 ? "M" : "L"}${project(point).join(" ")}`).join("") +
        (close ? "Z" : "")
      );
    };
    const diode = component.type === "diode" || component.type === "led";
    endpoint(`${role}.${diode ? "anode" : "a"}`, project([-60, 0]));
    endpoint(`${role}.${diode ? "cathode" : "b"}`, project([60, 0]));
    const boundary = component.type === "resistor" ? 40 : component.type === "capacitor" ? 10 : 22;
    lead(`${role}.${diode ? "anode" : "a"}`, project([-boundary, 0]));
    lead(`${role}.${diode ? "cathode" : "b"}`, project([boundary, 0]));
    const paths =
      component.type === "resistor"
        ? [
            path([
              [-60, 0],
              [-40, 0],
            ]),
            path(
              [
                [-40, -14],
                [40, -14],
                [40, 14],
                [-40, 14],
              ],
              true,
            ),
            path([
              [40, 0],
              [60, 0],
            ]),
          ]
        : component.type === "capacitor"
          ? [
              path([
                [-60, 0],
                [-10, 0],
              ]),
              path([
                [-10, -24],
                [-10, 24],
              ]),
              path([
                [10, -24],
                [10, 24],
              ]),
              path([
                [10, 0],
                [60, 0],
              ]),
            ]
          : [
              path([
                [-60, 0],
                [-22, 0],
              ]),
              path(
                [
                  [-22, -20],
                  [-22, 20],
                  [22, 0],
                ],
                true,
              ),
              path([
                [22, -24],
                [22, 24],
              ]),
              path([
                [22, 0],
                [60, 0],
              ]),
            ];
    if (component.type === "led")
      paths.push(
        path([
          [0, -32],
          [24, -56],
        ]),
        path([
          [12, -56],
          [24, -56],
          [24, -44],
        ]),
        path([
          [20, -30],
          [44, -54],
        ]),
        path([
          [32, -54],
          [44, -54],
          [44, -42],
        ]),
      );
    const points = localPoints.map(project);
    const xs = points.map(([px]) => px);
    const ys = points.map(([, py]) => py);
    scene.symbols.push({
      id: id(role),
      paths,
      box: {
        x: Math.min(...xs),
        y: Math.min(...ys),
        width: Math.max(...xs) - Math.min(...xs),
        height: Math.max(...ys) - Math.min(...ys),
      },
      gap: component.type === "capacitor" ? 20 : 16,
    });
    componentLabel(role, labelAt[0], labelAt[1], align);
  };
  const supply = (role: string, x: number, y: number) => {
    endpoint(`${role}.positive`, [x, y - 60]);
    endpoint(`${role}.negative`, [x, y + 60]);
    lead(`${role}.positive`, [x, y - 32]);
    lead(`${role}.negative`, [x, y + 32]);
    scene.symbols.push({
      id: id(role),
      paths: [
        `M${x} ${y - 60}V${y - 32}M${x} ${y + 32}V${y + 60}`,
        `M${x} ${y - 32}A32 32 0 1 1 ${x} ${y + 32}A32 32 0 1 1 ${x} ${y - 32}`,
        `M${x - 8} ${y - 12}H${x + 8}M${x} ${y - 20}V${y - 4}M${x - 8} ${y + 14}H${x + 8}`,
      ],
      box: { x: x - 32, y: y - 60, width: 64, height: 120 },
      gap: 16,
    });
    componentLabel(role, x + 60, y - 14);
  };
  const npn = (role: string, x: number, y: number) => {
    const length = Math.hypot(70, 38);
    const direction: Point = [70 / length, 38 / length];
    const tip: Point = [x + 43, y + 56.2];
    const rear: Point = [tip[0] - direction[0] * 20, tip[1] - direction[1] * 20];
    const arrow: Point[] = [
      tip,
      [rear[0] - direction[1] * 7, rear[1] + direction[0] * 7],
      [rear[0] + direction[1] * 7, rear[1] - direction[0] * 7],
    ];
    endpoint(`${role}.base`, [x - 80, y]);
    endpoint(`${role}.collector`, [x + 50, y - 80]);
    endpoint(`${role}.emitter`, [x + 50, y + 80]);
    lead(`${role}.base`, [x - 20, y]);
    lead(`${role}.collector`, [x + 50, y - 60]);
    lead(`${role}.emitter`, [x + 50, y + 60]);
    scene.symbols.push({
      id: id(role),
      paths: [
        `M${x - 80} ${y}H${x - 20}M${x - 20} ${y - 35}V${y + 35}`,
        `M${x - 20} ${y - 22}L${x + 50} ${y - 60}V${y - 80}M${x - 20} ${y + 22}L${x + 50} ${y + 60}V${y + 80}`,
      ],
      filledPaths: [
        `${arrow.map((point, index) => `${index === 0 ? "M" : "L"}${point.map((coordinate) => Number(coordinate.toFixed(4))).join(" ")}`).join("")}Z`,
      ],
      box: { x: x - 80, y: y - 80, width: 130, height: 160 },
      gap: 16,
    });
    componentLabel(role, x + 130, y - 20);
  };
  const opamp = (role: string, x: number, y: number) => {
    endpoint(`${role}.inverting`, [x - 150, y - 45]);
    endpoint(`${role}.noninverting`, [x - 150, y + 45]);
    endpoint(`${role}.output`, [x + 150, y]);
    endpoint(`${role}.vplus`, [x, y - 130]);
    endpoint(`${role}.vminus`, [x, y + 130]);
    lead(`${role}.inverting`, [x - 90, y - 45]);
    lead(`${role}.noninverting`, [x - 90, y + 45]);
    lead(`${role}.output`, [x + 100, y]);
    lead(`${role}.vplus`, [x, y - 50]);
    lead(`${role}.vminus`, [x, y + 50]);
    scene.symbols.push({
      id: id(role),
      paths: [
        `M${x - 90} ${y - 95}L${x + 100} ${y}L${x - 90} ${y + 95}Z`,
        `M${x - 150} ${y - 45}H${x - 90}M${x - 150} ${y + 45}H${x - 90}M${x + 100} ${y}H${x + 150}`,
        `M${x} ${y - 130}V${y - 50}M${x} ${y + 130}V${y + 50}`,
        `M${x - 75} ${y - 45}H${x - 55}M${x - 75} ${y + 45}H${x - 55}M${x - 65} ${y + 35}V${y + 55}`,
      ],
      box: { x: x - 150, y: y - 130, width: 300, height: 260 },
      gap: 16,
    });
    componentLabel(role, x + 100, y + 190);
  };
  label("title", document.presentation.title, 64, 82, {
    size: 34,
    family: "sans",
    region: "header",
  });
  label("subtitle", recipe.title, 64, 115, {
    size: 15,
    family: "sans",
    token: "muted",
    region: "header",
  });
  label(
    "formula",
    recipe.derived.formula ?? "Topology illustration, not a device simulation",
    64,
    footerTop + 45,
    { size: 20, region: "footer" },
  );
  label("assumption", recipe.derived.assumption, 64, footerTop + 76, {
    size: 14,
    family: "sans",
    token: "muted",
    region: "footer",
  });

  switch (preset) {
    case "loaded-divider":
      terminal("input", [180, 300]);
      terminal("output", [1100, 300]);
      twoPin("top", 400, 300, "right", [400, 235], "center");
      twoPin("bottom", 600, 520, "down", [650, 506]);
      twoPin("load", 900, 520, "down", [950, 506]);
      ground("ground", 750, 760);
      wire("input", [180, 300], [340, 300]);
      wire("output", [460, 300], [1100, 300]);
      wire("output", [600, 300], [600, 460]);
      wire("output", [900, 300], [900, 460]);
      dot("output", [600, 300]);
      dot("output", [900, 300]);
      wire("ground", [600, 580], [600, 720], [900, 720], [900, 580]);
      wire("ground", [750, 720], [750, 760]);
      dot("ground", [750, 720]);
      break;
    case "rc-ladder":
      terminal("input", [150, 320]);
      terminal("output", [1150, 320]);
      twoPin("first", 330, 320, "right", [330, 255], "center");
      twoPin("second", 750, 320, "right", [750, 255], "center");
      twoPin("firstShunt", 500, 520, "down", [560, 506]);
      twoPin("secondShunt", 950, 520, "down", [1010, 506]);
      ground("ground", 750, 760);
      wire("input", [150, 320], [270, 320]);
      wire("first.b", [390, 320], [690, 320]);
      wire("first.b", [500, 320], [500, 460]);
      dot("first.b", [500, 320]);
      wire("output", [810, 320], [1150, 320]);
      wire("output", [950, 320], [950, 460]);
      dot("output", [950, 320]);
      wire("ground", [500, 580], [500, 720], [950, 720], [950, 580]);
      wire("ground", [750, 720], [750, 760]);
      dot("ground", [750, 720]);
      break;
    case "wheatstone-bridge":
      terminal("input", [700, 240]);
      terminal("outputLeft", [180, 550]);
      terminal("outputRight", [1220, 550]);
      twoPin("upperLeft", 450, 410, "down", [510, 396]);
      twoPin("lowerLeft", 450, 710, "down", [510, 696]);
      twoPin("upperRight", 950, 410, "down", [1010, 396]);
      twoPin("lowerRight", 950, 710, "down", [1010, 696]);
      ground("ground", 700, 900);
      wire("input", [450, 350], [450, 280], [950, 280], [950, 350]);
      wire("input", [700, 240], [700, 280]);
      dot("input", [700, 280]);
      wire("outputLeft", [450, 470], [450, 650]);
      wire("outputLeft", [180, 550], [450, 550]);
      dot("outputLeft", [450, 550]);
      wire("outputRight", [950, 470], [950, 650]);
      wire("outputRight", [950, 550], [1220, 550]);
      dot("outputRight", [950, 550]);
      wire("ground", [450, 770], [450, 850], [950, 850], [950, 770]);
      wire("ground", [700, 850], [700, 900]);
      dot("ground", [700, 850]);
      break;
    case "bridge-rectifier":
      terminal("inputA", [180, 560]);
      terminal("inputB", [1050, 560]);
      terminal("output", [1500, 260]);
      twoPin("positiveA", 450, 420, "up", [510, 406]);
      twoPin("positiveB", 800, 420, "up", [860, 406]);
      twoPin("negativeA", 450, 720, "up", [510, 706]);
      twoPin("negativeB", 800, 720, "up", [860, 706]);
      twoPin("load", 1150, 700, "down", [1210, 686]);
      twoPin("filter", 1400, 700, "down", [1460, 686]);
      ground("ground", 1150, 950);
      wire("inputA", [450, 480], [450, 660]);
      wire("inputA", [180, 560], [450, 560]);
      dot("inputA", [450, 560]);
      wire("inputB", [800, 480], [800, 660]);
      wire("inputB", [800, 560], [1050, 560]);
      dot("inputB", [800, 560]);
      wire("output", [450, 360], [450, 260], [1500, 260]);
      wire("output", [800, 360], [800, 260]);
      dot("output", [800, 260]);
      wire("output", [1150, 640], [1150, 260]);
      dot("output", [1150, 260]);
      wire("output", [1400, 640], [1400, 260]);
      dot("output", [1400, 260]);
      wire("ground", [450, 780], [450, 900], [1400, 900], [1400, 760]);
      wire("ground", [800, 780], [800, 900]);
      dot("ground", [800, 900]);
      wire("ground", [1150, 760], [1150, 900], [1150, 950]);
      dot("ground", [1150, 900]);
      break;
    case "transistor-switch":
      supply("supply", 250, 560);
      terminal("control", [300, 840]);
      twoPin("series", 1000, 370, "down", [1090, 356]);
      twoPin("led", 1000, 560, "down", [1090, 546]);
      twoPin("baseResistor", 600, 840, "right", [600, 775], "center");
      npn("switch", 950, 840);
      ground("ground", 700, 1030);
      wire("supply.positive", [250, 500], [250, 260], [1000, 260], [1000, 310]);
      wire("series.b", [1000, 430], [1000, 500]);
      wire("led.cathode", [1000, 620], [1000, 760]);
      wire("control", [300, 840], [540, 840]);
      wire("baseResistor.b", [660, 840], [870, 840]);
      wire("ground", [250, 620], [250, 1000], [1000, 1000], [1000, 920]);
      wire("ground", [700, 1000], [700, 1030]);
      dot("ground", [700, 1000]);
      break;
    case "inverting-amplifier":
      terminal("input", [150, 605]);
      terminal("output", [1370, 650]);
      terminal("positiveSupply", [950, 440], [1030, 448], "left");
      terminal("negativeSupply", [950, 920], [1030, 928], "left");
      twoPin("inputResistor", 400, 605, "right", [400, 540], "center");
      twoPin("feedback", 950, 350, "right", [950, 285], "center");
      opamp("amplifier", 950, 650);
      ground("ground", 740, 940);
      wire("input", [150, 605], [340, 605]);
      wire("amplifier.inverting", [460, 605], [800, 605]);
      wire("amplifier.inverting", [650, 605], [650, 350], [890, 350]);
      dot("amplifier.inverting", [650, 605]);
      wire("output", [1100, 650], [1370, 650]);
      wire("output", [1250, 650], [1250, 350], [1010, 350]);
      dot("output", [1250, 650]);
      wire("ground", [800, 695], [740, 695], [740, 940]);
      wire("positiveSupply", [950, 440], [950, 520]);
      wire("negativeSupply", [950, 780], [950, 920]);
      break;
  }
  return scene;
}
