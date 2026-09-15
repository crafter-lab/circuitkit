import { z } from "zod";

export const basicRecipeIds = ["rc-lowpass", "voltage-divider", "led-series"] as const;
export const complexRecipeIds = [
  "loaded-divider",
  "rc-ladder",
  "wheatstone-bridge",
  "bridge-rectifier",
  "transistor-switch",
  "inverting-amplifier",
] as const;
export const recipeIds = [...basicRecipeIds, ...complexRecipeIds] as const;
export const themePresets = ["geist-light", "geist-dark", "geist-print"] as const;
export const recipeSchema = z.enum(recipeIds);
export const themePresetSchema = z.enum(themePresets);
export const semanticTones = ["blue", "amber", "violet", "green", "rose", "cyan"] as const;
export const semanticToneSchema = z.enum(semanticTones);
export type SemanticTone = z.infer<typeof semanticToneSchema>;
const annotationText = z.string().refine((value) => value.trim().length > 0, "Use nonempty text.");
export const annotationsSchema = z.strictObject({
  nets: z.array(
    z.strictObject({
      net: annotationText,
      label: annotationText,
      description: z.string(),
      tone: semanticToneSchema,
    }),
  ),
  legend: z.boolean(),
  caption: z.string().optional(),
});
export type RecipeId = z.infer<typeof recipeSchema>;
export type ThemePreset = z.infer<typeof themePresetSchema>;

export const idSchema = z
  .string()
  .min(1)
  .regex(/^[^.]+$/, "IDs must not contain '.'; it separates component IDs from pins.");
const positiveSI = z.number().finite().positive();
const opaqueHex = z
  .string()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Use an opaque #RGB or #RRGGBB color.");

export const componentSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("resistor"), resistance: positiveSI }),
  z.strictObject({ type: z.literal("capacitor"), capacitance: positiveSI }),
  z.strictObject({ type: z.literal("led") }),
  z.strictObject({ type: z.literal("diode") }),
  z.strictObject({ type: z.literal("npn") }),
  z.strictObject({ type: z.literal("op-amp") }),
  z.strictObject({ type: z.literal("dc-source"), voltage: positiveSI }),
]);

export const componentPins = {
  resistor: ["a", "b"],
  capacitor: ["a", "b"],
  led: ["anode", "cathode"],
  diode: ["anode", "cathode"],
  npn: ["base", "collector", "emitter"],
  "op-amp": ["noninverting", "inverting", "output", "vplus", "vminus"],
  "dc-source": ["positive", "negative"],
} as const;

export const themeOverridesSchema = z.strictObject({
  background: opaqueHex.optional(),
  wire: opaqueHex.optional(),
  label: opaqueHex.optional(),
  muted: opaqueHex.optional(),
  border: opaqueHex.optional(),
  highlight: opaqueHex.optional(),
  strokeWidth: positiveSI.optional(),
  fontScale: positiveSI.optional(),
});

function idRecord<T extends z.ZodType>(valueSchema: T) {
  const definition = z.record(idSchema, valueSchema);
  const record = z
    .unknown()
    .superRefine((input, context) => {
      const result = definition.safeParse(input);
      if (!result.success) {
        for (const issue of result.error.issues) context.addIssue({ ...issue });
      }
      if (input !== null && typeof input === "object" && Object.hasOwn(input, "__proto__")) {
        const value = valueSchema.safeParse(Reflect.get(input, "__proto__"));
        if (!value.success) {
          for (const issue of value.error.issues)
            context.addIssue({ ...issue, path: ["__proto__", ...issue.path] });
        }
      }
    })
    .overwrite((input) => {
      if (input === null || typeof input !== "object" || Array.isArray(input)) return input;
      return Object.fromEntries(
        Object.entries(input).map(([key, value]) => {
          const parsed = valueSchema.safeParse(value);
          return [key, parsed.success ? parsed.data : value];
        }),
      );
    })
    .meta(z.toJSONSchema(definition));
  return record as z.ZodType<z.output<typeof definition>>;
}

export const figureSchema = z
  .strictObject({
    version: z.literal(1),
    circuit: z.strictObject({
      components: idRecord(componentSchema),
      ports: idRecord(z.strictObject({ kind: z.enum(["terminal", "ground"]) })),
      nets: idRecord(z.array(z.string().min(1)).min(2)),
    }),
    layout: z.strictObject({
      preset: recipeSchema,
      roles: idRecord(idSchema),
    }),
    presentation: z.strictObject({
      title: z.string(),
      annotations: annotationsSchema.optional(),
      theme: z.strictObject({
        preset: themePresetSchema,
        overrides: themeOverridesSchema.optional(),
      }),
      highlight: z
        .strictObject({
          components: z.array(idSchema),
          nets: z.array(idSchema),
        })
        .optional(),
    }),
  })
  .meta({ "x-component-pins": componentPins });

export type FigureDocument = z.infer<typeof figureSchema>;
