import type {
  AuthorFigure,
  ElectricalPanel,
  Panel,
  Point,
  StageModel,
  Target,
  Theme,
} from "./schema.ts";

export function stageModel(
  panels: Panel[],
  options: { title?: string; description?: string; theme?: Theme; expose?: Target[] } = {},
): StageModel {
  return {
    title: options.title ?? "Educational figure",
    description: options.description ?? "",
    theme: options.theme ?? "geist-light",
    panels: structuredClone(panels),
    expose: structuredClone(options.expose ?? []),
  };
}
export function authorFigure(id: string, stages: AuthorFigure["stages"]): AuthorFigure {
  return { schema: "circuitkit.educational.author.v2", id, stages: structuredClone(stages) };
}
export function placePanel<T extends Panel>(panel: T, at: Point): T {
  return { ...structuredClone(panel), at: { ...at } };
}
export function electricalPanel(
  id: string,
  terminals: ElectricalPanel["terminals"],
  components: ElectricalPanel["components"],
  routes: ElectricalPanel["routes"],
  at: Point = { x: 0, y: 0 },
): ElectricalPanel {
  return {
    kind: "electrical",
    id,
    at: { ...at },
    terminals: structuredClone(terminals),
    components: structuredClone(components),
    routes: structuredClone(routes),
  };
}
