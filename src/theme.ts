import type { FigureDocument, SemanticTone, ThemePreset } from "./schema.ts";

export const annotationPalettes: Record<ThemePreset, Record<SemanticTone, string>> = {
  "geist-light": {
    blue: "#005bb5",
    amber: "#875900",
    violet: "#6d28d9",
    green: "#15743c",
    rose: "#be185d",
    cyan: "#0e6f80",
  },
  "geist-dark": {
    blue: "#70b7ff",
    amber: "#f5c451",
    violet: "#c4a1ff",
    green: "#6cdb98",
    rose: "#ff8fba",
    cyan: "#67d8e8",
  },
  "geist-print": {
    blue: "#000000",
    amber: "#000000",
    violet: "#000000",
    green: "#000000",
    rose: "#000000",
    cyan: "#000000",
  },
};

import type { Diagnostic } from "./types.ts";

export interface Theme {
  background: string;
  wire: string;
  label: string;
  muted: string;
  border: string;
  highlight: string;
  strokeWidth: number;
  fontScale: number;
}

export const themes: Record<ThemePreset, Theme> = {
  "geist-light": {
    background: "#ffffff",
    wire: "#333333",
    label: "#171717",
    muted: "#666666",
    border: "#e5e5e5",
    highlight: "#0068d6",
    strokeWidth: 2,
    fontScale: 1,
  },
  "geist-dark": {
    background: "#0a0a0a",
    wire: "#ededed",
    label: "#fafafa",
    muted: "#a1a1a1",
    border: "#333333",
    highlight: "#70b7ff",
    strokeWidth: 2,
    fontScale: 1,
  },
  "geist-print": {
    background: "#ffffff",
    wire: "#000000",
    label: "#000000",
    muted: "#404040",
    border: "#b3b3b3",
    highlight: "#000000",
    strokeWidth: 2,
    fontScale: 1,
  },
};

function luminance(hex: string) {
  const digits = hex.slice(1);
  const expanded =
    digits.length === 3 ? [...digits].map((digit) => digit + digit).join("") : digits;
  const values = [0, 2, 4].map((offset) => {
    const s = Number.parseInt(expanded.slice(offset, offset + 2), 16) / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return (values[0] ?? 0) * 0.2126 + (values[1] ?? 0) * 0.7152 + (values[2] ?? 0) * 0.0722;
}

export function contrast(a: string, b: string) {
  const first = luminance(a);
  const second = luminance(b);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

export function resolveTheme(document: FigureDocument) {
  const theme = {
    ...themes[document.presentation.theme.preset],
    ...Object.fromEntries(
      Object.entries(document.presentation.theme.overrides ?? {}).filter(
        ([, value]) => value !== undefined,
      ),
    ),
  };
  const diagnostics: Diagnostic[] = [];
  for (const token of ["wire", "label", "muted", "highlight"] as const) {
    const minimum = token === "wire" ? 3 : 4.5;
    const ratio = contrast(theme[token], theme.background);
    if (ratio < minimum)
      diagnostics.push({
        code: "theme.insufficient_contrast",
        path: `/presentation/theme/overrides/${token}`,
        message: `${token} contrast ${ratio.toFixed(2)}:1 is below WCAG AA ${minimum}:1 against background. Choose a higher-contrast opaque color.`,
      });
  }
  return { theme, diagnostics };
}
