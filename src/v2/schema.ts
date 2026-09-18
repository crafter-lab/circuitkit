import { z } from "zod";

export const stageSchema = z.enum(["teaching", "question", "correction"]);
export const themeSchema = z.enum(["geist-light", "geist-dark", "geist-print"]);
const id = z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,47}$/);
export const semanticIdSchema = z.string().regex(/^[A-Za-z][A-Za-z0-9_/-]{0,191}$/);
const text = z
  .string()
  .max(240)
  .refine((s) =>
    Array.from(s).every((character) => {
      const code = character.codePointAt(0) ?? 0;
      return (
        code >= 32 &&
        !(code >= 127 && code <= 159) &&
        !(code >= 0xd800 && code <= 0xdfff) &&
        code !== 0xfffe &&
        code !== 0xffff
      );
    }),
  );
export const scalarSchema = z.number().finite().min(-1e12).max(1e12);
const coordinate = z.number().finite().min(-10000).max(10000);
const extent = z.number().finite().min(0).max(10000);
export const pointSchema = z.strictObject({ x: coordinate, y: coordinate });
export const runsSchema = z
  .array(
    z.strictObject({
      text: text.min(1),
      script: z.enum(["base", "sub", "sup"]),
    }),
  )
  .min(1)
  .max(16)
  .refine((runs) => runs.reduce((n, run) => n + run.text.length, 0) <= 240);
export const unitSchema = z.enum(["V", "A", "Ω", "W", "F", "s", "Hz", "scalar"]);
export const valueSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("known"),
    value: scalarSchema,
    unit: unitSchema,
    display: runsSchema.optional(),
  }),
  z.strictObject({ kind: z.literal("symbolic"), symbol: runsSchema, unit: unitSchema }),
  z.strictObject({ kind: z.literal("unknown"), unit: unitSchema }),
]);
export const readingSchema = z.discriminatedUnion("mode", [
  z.strictObject({ mode: z.literal("authored"), value: valueSchema }),
  z.strictObject({
    mode: z.literal("derived"),
    operation: z.enum([
      "voltage-difference",
      "ohm-current",
      "ohm-voltage",
      "ohm-resistance",
      "power",
      "divider",
    ]),
    inputs: z.array(valueSchema).min(2).max(3),
    assumptions: z
      .array(
        z.enum([
          "common-reference",
          "ideal-voltmeter",
          "ohmic",
          "passive-sign",
          "unloaded-divider",
        ]),
      )
      .min(1)
      .max(5),
  }),
]);
const tone = z.enum(["ink", "muted", "accent", "positive", "negative"]);
const paint = z.enum(["none", "background", "ink", "muted", "accent", "positive", "negative"]);
export const shapeSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("line"),
    points: z.array(pointSchema).min(2).max(512),
    tone,
    width: z.number().min(0.5).max(6),
    dashed: z.boolean(),
  }),
  z.strictObject({
    kind: z.literal("polygon"),
    points: z.array(pointSchema).min(3).max(32),
    tone,
    fill: paint,
    width: z.number().min(0.5).max(6),
  }),
  z.strictObject({
    kind: z.literal("rect"),
    at: pointSchema,
    width: extent,
    height: extent,
    radius: z.number().min(0).max(30),
    tone,
    fill: paint,
    stroke: z.number().min(0.5).max(6),
  }),
  z.strictObject({
    kind: z.literal("circle"),
    at: pointSchema,
    radius: z.number().min(0.5).max(1000),
    tone,
    fill: paint,
    stroke: z.number().min(0.5).max(6),
  }),
  z.strictObject({
    kind: z.literal("math"),
    at: pointSchema,
    runs: runsSchema,
    size: z.number().min(8).max(36),
    align: z.enum(["left", "center", "right"]),
    family: z.enum(["sans", "mono"]),
    tone,
  }),
]);
export const partSchema = z.strictObject({
  id: semanticIdSchema,
  shapes: z.array(shapeSchema).min(1).max(128),
});
const partTargetSchema = z.strictObject({
  id: semanticIdSchema,
  label: text.min(1),
  role: z.enum([
    "component",
    "terminal",
    "route",
    "probe",
    "reading",
    "trace",
    "edge",
    "window",
    "axis",
    "contact",
    "pin",
    "body",
    "label",
  ]),
});
const netExposureSchema = z.strictObject({
  id: semanticIdSchema,
  label: text.min(1),
  role: z.literal("net"),
});
export const netTargetSchema = z.strictObject({
  id: semanticIdSchema,
  label: text.min(1),
  role: z.literal("net"),
  kind: z.literal("group"),
  members: z.array(semanticIdSchema).min(1).max(640),
});
export const targetSchema = z.discriminatedUnion("role", [partTargetSchema, netExposureSchema]);
export const publicTargetSchema = z.discriminatedUnion("role", [partTargetSchema, netTargetSchema]);
export const publicSchema = z.strictObject({
  schema: z.literal("circuitkit.educational.public.v2"),
  id,
  title: text.min(1),
  description: text,
  theme: themeSchema,
  display: z.array(partSchema).max(2048),
  targets: z.array(publicTargetSchema).max(512),
});
const base = { id, at: pointSchema, title: text.optional() };
const terminal = z.strictObject({
  id,
  at: pointSchema,
  label: runsSchema.optional(),
  labelAt: pointSchema.optional(),
  connection: z.enum(["required", "free"]),
  potential: valueSchema.optional(),
});
const componentBase = {
  id,
  terminals: z.tuple([id, id]),
  label: runsSchema.optional(),
  labelAt: pointSchema.optional(),
  intent: z.enum(["normal", "intentional-fault"]),
};
const passiveComponent = <K extends string>(kind: K) =>
  z.strictObject({
    ...componentBase,
    kind: z.literal(kind),
    state: z.enum(["normal", "open", "short"]),
    value: valueSchema.optional(),
    valueAt: pointSchema.optional(),
  });
export const componentSchema = z.discriminatedUnion("kind", [
  passiveComponent("source"),
  passiveComponent("resistor"),
  passiveComponent("capacitor"),
  passiveComponent("led"),
  passiveComponent("diode"),
  z.strictObject({
    ...componentBase,
    kind: z.literal("button"),
    state: z.enum(["open", "closed"]),
  }),
]);
export const electricalSchema = z.strictObject({
  ...base,
  kind: z.literal("electrical"),
  namedNets: z
    .array(z.strictObject({ id, terminal: id }))
    .max(256)
    .optional(),
  terminals: z.array(terminal).min(1).max(256),
  components: z.array(componentSchema).max(128),
  routes: z
    .array(
      z.strictObject({
        id,
        from: id,
        to: id,
        via: z.array(pointSchema).max(64),
        state: z.enum(["connected", "open"]),
        intent: z.enum(["normal", "intentional-fault"]),
        bypass: id.optional(),
      }),
    )
    .max(256),
});
const probe = z.strictObject({ panel: id, terminal: id, via: z.array(pointSchema).max(64) });
export const measurementSchema = z.strictObject({
  ...base,
  kind: z.literal("measurement"),
  model: z.literal("ideal-voltmeter"),
  positive: probe,
  negative: probe,
  reading: z.discriminatedUnion("mode", [
    z.strictObject({ mode: z.literal("authored"), value: valueSchema }),
    z.strictObject({
      mode: z.literal("potential-difference"),
      assumptions: z.tuple([z.literal("common-reference"), z.literal("ideal-voltmeter")]),
    }),
  ]),
});
const level = z.enum(["HIGH", "LOW"]);
export const signalSchema = z.strictObject({
  ...base,
  kind: z.literal("signal"),
  width: z.number().min(80).max(2000),
  height: z.number().min(30).max(500),
  unit: z.enum(["s", "ms", "us", "ticks"]),
  data: z.discriminatedUnion("mode", [
    z.strictObject({
      mode: z.literal("samples"),
      values: z.array(level).min(1).max(128),
      period: scalarSchema.gt(0),
      start: scalarSchema,
    }),
    z.strictObject({
      mode: z.literal("transitions"),
      initial: level,
      start: scalarSchema,
      end: scalarSchema,
      changes: z.array(z.strictObject({ at: scalarSchema, level })).max(128),
    }),
  ]),
  edges: z.enum(["none", "rising", "falling", "both"]),
  sampleLabels: z.boolean(),
  debounce: z.strictObject({ duration: scalarSchema.gt(0), initial: level }).optional(),
  window: z.strictObject({ from: scalarSchema, to: scalarSchema, label: runsSchema }).optional(),
});
export const timelineSchema = z.strictObject({
  ...base,
  kind: z.literal("timeline"),
  start: z
    .number()
    .int()
    .min(0)
    .max(2 ** 32 - 1),
  now: z
    .number()
    .int()
    .min(0)
    .max(2 ** 32 - 1),
  modulus: z
    .number()
    .int()
    .min(2)
    .max(2 ** 32)
    .optional(),
  wraps: z.number().int().min(0).max(100),
  unit: z.enum(["s", "ms", "us", "ticks"]),
  showElapsed: z.boolean(),
  width: z.number().min(100).max(2000),
});
export const levelsSchema = z.strictObject({
  ...base,
  kind: z.literal("levels"),
  low: scalarSchema,
  high: scalarSchema,
  max: scalarSchema.gt(0),
  value: valueSchema.optional(),
  showClassification: z.boolean(),
  width: z.number().min(200).max(2000),
});
const entry = z.strictObject({ id, label: runsSchema, reading: readingSchema });
export const quantitySchema = z.strictObject({
  ...base,
  kind: z.literal("quantity"),
  items: z
    .array(z.strictObject({ id, quantity: z.enum(["V", "I", "R", "P"]), reading: readingSchema }))
    .min(1)
    .max(32),
});
export const readingsSchema = z.strictObject({
  ...base,
  kind: z.literal("readings"),
  items: z.array(entry).min(1).max(32),
});
export const barsSchema = z.strictObject({
  ...base,
  kind: z.literal("bars"),
  unit: unitSchema,
  min: scalarSchema,
  max: scalarSchema,
  width: z.number().min(100).max(2000),
  items: z
    .array(z.strictObject({ id, label: runsSchema, value: valueSchema }))
    .min(1)
    .max(32),
  threshold: z.strictObject({ value: scalarSchema, label: runsSchema }).optional(),
});
export const scaleSchema = z.strictObject({
  ...base,
  kind: z.literal("scale"),
  unit: unitSchema,
  prefix: z.enum(["n", "u", "m", "", "k", "M"]),
  ticks: z.array(scalarSchema).min(2).max(16),
  value: valueSchema.optional(),
  input: z
    .strictObject({
      from: z.enum(["base", "prefixed"]),
      magnitude: scalarSchema,
      display: runsSchema.optional(),
    })
    .optional(),
  showConverted: z.boolean(),
  width: z.number().min(100).max(2000),
});
const pin = z.strictObject({
  id,
  at: pointSchema,
  label: runsSchema,
  role: z.enum(["gpio", "input-only", "power", "ground", "strapping", "passive", "unknown"]),
});
export const breadboardSchema = z.strictObject({
  ...base,
  kind: z.literal("breadboard"),
  width: extent.gt(0),
  height: extent.gt(0),
  contacts: z
    .array(z.strictObject({ id, at: pointSchema, label: runsSchema.optional() }))
    .min(1)
    .max(256),
  groups: z
    .array(z.strictObject({ id, contacts: z.array(id).min(1).max(64) }))
    .min(1)
    .max(128),
  showGroups: z.boolean(),
  links: z
    .array(z.strictObject({ id, from: id, to: id, via: z.array(pointSchema).max(64) }))
    .max(128),
});
export const pinoutSchema = z.strictObject({
  ...base,
  kind: z.literal("pinout"),
  width: extent.gt(0),
  height: extent.gt(0),
  pins: z.array(pin).min(1).max(128),
});
export const boardSchema = z.strictObject({
  ...base,
  kind: z.literal("board"),
  width: extent.gt(0),
  height: extent.gt(0),
  pins: z.array(pin).max(128),
  chips: z
    .array(
      z.strictObject({
        id,
        at: pointSchema,
        width: extent.gt(0),
        height: extent.gt(0),
        label: runsSchema,
      }),
    )
    .max(32),
});
export const panelSchema = z.discriminatedUnion("kind", [
  electricalSchema,
  measurementSchema,
  signalSchema,
  timelineSchema,
  levelsSchema,
  quantitySchema,
  readingsSchema,
  barsSchema,
  scaleSchema,
  breadboardSchema,
  pinoutSchema,
  boardSchema,
]);
export const stageModelSchema = z.strictObject({
  title: text.min(1),
  description: text,
  theme: themeSchema,
  panels: z.array(panelSchema).max(32),
  expose: z.array(targetSchema).max(512),
});
export const authorSchema = z.strictObject({
  schema: z.literal("circuitkit.educational.author.v2"),
  id,
  stages: z.strictObject({
    teaching: stageModelSchema,
    question: stageModelSchema,
    correction: stageModelSchema,
  }),
});

export const authorEnvelopeSchema = z.strictObject({
  schema: z.literal("circuitkit.educational.author.v2"),
  id,
  stages: z.strictObject({ teaching: z.unknown(), question: z.unknown(), correction: z.unknown() }),
});

export type Stage = z.infer<typeof stageSchema>;
export type AuthorFigure = z.infer<typeof authorSchema>;
export type PublicFigure = z.infer<typeof publicSchema>;
export type StageModel = z.infer<typeof stageModelSchema>;
export type Panel = z.infer<typeof panelSchema>;
export type ElectricalPanel = z.infer<typeof electricalSchema>;
export type MeasurementPanel = z.infer<typeof measurementSchema>;
export type SignalPanel = z.infer<typeof signalSchema>;
export type Shape = z.infer<typeof shapeSchema>;
export type Part = z.infer<typeof partSchema>;
export type Target = z.infer<typeof targetSchema>;
export type NetTarget = z.infer<typeof netTargetSchema>;
export type PublicTargetDefinition = z.infer<typeof publicTargetSchema>;
export type Point = z.infer<typeof pointSchema>;
export type MathRun = z.infer<typeof runsSchema>[number];
export type Value = z.infer<typeof valueSchema>;
export type Unit = z.infer<typeof unitSchema>;
export type Reading = z.infer<typeof readingSchema>;
export type Component = z.infer<typeof componentSchema>;
export type Theme = z.infer<typeof themeSchema>;
