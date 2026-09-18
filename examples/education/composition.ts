import {
  type ElectricalPanel,
  type MeasurementPanel,
  placePanel,
  point,
  type StageModel,
  stageModel,
  type Target,
  type Theme,
} from "circuitkit/v2";

export function measuredStage(
  circuit: ElectricalPanel,
  options: {
    title: string;
    description: string;
    positive: string;
    negative: string;
    reading: MeasurementPanel["reading"];
    expose: Target[];
    theme?: Theme;
  },
): StageModel {
  const meter: MeasurementPanel = {
    kind: "measurement",
    id: "meter",
    at: point(520, 80),
    model: "ideal-voltmeter",
    positive: {
      panel: circuit.id,
      terminal: options.positive,
      via: [point(-60, -120), point(20, -120)],
    },
    negative: {
      panel: circuit.id,
      terminal: options.negative,
      via: [point(-40, 260), point(120, 260)],
    },
    reading: options.reading,
  };
  return stageModel([placePanel(circuit, point(40, 40)), meter], {
    title: options.title,
    description: options.description,
    theme: options.theme ?? "geist-light",
    expose: [
      ...options.expose,
      { id: "meter/probe/positive", label: "Red probe", role: "probe" },
      { id: "meter/probe/negative", label: "COM probe", role: "probe" },
      { id: "meter/reading", label: "Meter reading", role: "reading" },
    ],
  });
}
