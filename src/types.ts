import type { FigureDocument, SemanticTone } from "./schema.ts";

export interface ResolvedNetAnnotation {
  net: string;
  label: string;
  description: string;
  tone: SemanticTone;
  color: string;
  paths: string[];
  segments: Array<{ a: readonly [number, number]; b: readonly [number, number] }>;
  labelBounds: Box;
}

export interface ResolvedAnnotations {
  nets: ResolvedNetAnnotation[];
  legend: boolean;
  caption: string;
}

export interface Diagnostic {
  code: string;
  path: string;
  message: string;
  validPins?: string[];
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FigureBounds extends Box {
  labels: Record<string, Box>;
  symbols: Record<string, Box>;
  routes: Record<string, Box[]>;
}

export interface Failure {
  ok: false;
  diagnostics: Diagnostic[];
}

export interface FigureInfo {
  ok: true;
  diagnostics: Diagnostic[];
  document: FigureDocument;
  circuit: FigureDocument["circuit"];
  bounds: FigureBounds;
  rendererVersion: string;
  annotations?: ResolvedAnnotations;
}

export type RenderResult = (FigureInfo & { svg: string }) | Failure;
export type ValidationResult = FigureInfo | Failure;
export type InspectResult =
  | (FigureInfo & {
      version: number;
      components: FigureDocument["circuit"]["components"];
      terminals: FigureDocument["circuit"]["ports"];
      nets: FigureDocument["circuit"]["nets"];
      roles: FigureDocument["layout"]["roles"];
      endpoints: Record<string, { x: number; y: number; net: string }>;
    })
  | Failure;
