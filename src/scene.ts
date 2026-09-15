import type { Box } from "./types.ts";
import type { Family } from "./typography.ts";

export type Point = readonly [number, number];
export interface Route {
  net: string;
  points: Point[];
}
export interface SymbolShape {
  id: string;
  paths: string[];
  filledPaths?: string[];
  box: Box;
  gap: number;
}
export interface Label {
  id: string;
  text: string;
  x: number;
  y: number;
  size: number;
  family: Family;
  align: "left" | "center" | "right";
  token: "label" | "muted";
  region: "header" | "scene" | "footer";
}
export interface Scene {
  routes: Route[];
  leads?: { endpoint: string; points: Point[] }[];
  symbols: SymbolShape[];
  dots: { net: string; point: Point }[];
  terminals: { id: string; net: string; point: Point }[];
  labels: Label[];
  endpoints: Record<string, { x: number; y: number; net: string }>;
  frame?: {
    width: number;
    height: number;
    headerBottom: number;
    footerTop: number;
    sceneRegion: Box;
  };
}
