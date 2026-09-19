import type { FigureDocument } from "../../src/schema.ts";

export const recipes = ["rc-lowpass", "inverting-amplifier", "bridge-rectifier"] as const;
export const themes = ["geist-light", "geist-dark", "geist-print"] as const;
export const compositions = ["classic", "compact"] as const;
export type Theme = (typeof themes)[number];
export type Recipe = (typeof recipes)[number];

export interface PreviewInput {
  recipe: Recipe;
  theme: Theme;
  source: string;
  sha256: string;
  copy: string;
  document: FigureDocument;
}

export interface PreviewLesson {
  source: string;
  sha256: string;
  copy: string;
  document: FigureDocument;
}

export interface PreviewData {
  gitCommit: string;
  sourceSha256: string;
  baselineMatches: number;
  cliRenders: number;
  inputs: PreviewInput[];
  lessons: PreviewLesson[];
}
