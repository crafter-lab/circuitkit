import type { ConnectionKind, DiagramView, ModuleKind, Theme } from "../diagram/schema.ts";
import type { Diagnostic, Failure } from "../types.ts";

export type SourceRange = NonNullable<Diagnostic["range"]>;
export type SourcePort = { id: string; label?: string; range: SourceRange };
export type SourceEndpoint = { module: string; port: string; range: SourceRange };
export type SourceModule = {
  id: string;
  type: string;
  label?: string;
  ports?: SourcePort[];
  range: SourceRange;
};
export type SourceConnection = {
  from: SourceEndpoint;
  to: SourceEndpoint;
  kind: ConnectionKind;
  bus?: string;
  label?: string;
  direction?: "forward" | "both";
  range: SourceRange;
  busRange?: SourceRange;
};
export type SourceExposure = { port: string; target: SourceEndpoint; range: SourceRange };
export type SourceBody = {
  modules: SourceModule[];
  connections: SourceConnection[];
  exposures: SourceExposure[];
};
export type SourceDefinition = SourceBody & { id: string; ports: SourcePort[]; range: SourceRange };
export type PresentationSelector = (
  | { kind: "module" | "bus" | "section"; name: string }
  | { kind: "port"; endpoint: SourceEndpoint }
  | { kind: "link"; from: SourceEndpoint; to: SourceEndpoint }
) & { range: SourceRange };
export type SourcePresentation = {
  sections: { id: string; selectors: PresentationSelector[]; range: SourceRange }[];
  scenes: {
    id: string;
    label: string;
    highlights: PresentationSelector[];
    dim: boolean;
    flows: {
      selector: PresentationSelector;
      periodMs: number;
      direction: "declared" | "forward" | "reverse";
      range: SourceRange;
    }[];
    range: SourceRange;
  }[];
  range: SourceRange;
};
export type PresentationMember =
  | { kind: "module"; path: string }
  | { kind: "port"; endpoint: string }
  | { kind: "link"; from: string; to: string };
export type ResolvedPresentation = {
  sections: { id: string; members: PresentationMember[] }[];
  scenes: {
    id: string;
    label: string;
    highlights: PresentationMember[];
    dim: boolean;
    flows: { from: string; to: string; periodMs: number }[];
    range: SourceRange;
  }[];
};
export type PresentationPlan = {
  scenes: {
    id: string;
    label: string;
    targets: string[];
    dim: boolean;
    flows: { target: string; points: { x: number; y: number }[]; periodMs: number }[];
    unavailable: string[];
    range: SourceRange;
  }[];
};
export type SourceProgram = SourceBody & {
  schema: "circuitkit.source.v1";
  id: string;
  title: string;
  view: DiagramView;
  theme: Theme;
  definitions: SourceDefinition[];
  range: SourceRange;
  titleRange: SourceRange;
  presentation?: SourcePresentation;
};
export type SourceResult<T> = ({ ok: true; diagnostics: [] } & T) | Failure;
export type SystemPort = { id: string; label: string };
export type SystemNode = {
  path: string;
  id: string;
  type: string;
  label: string;
  kind: ModuleKind | "assembly";
  ports: SystemPort[];
  parent: string;
  range: SourceRange;
};
export type SystemConnection = {
  from: string;
  to: string;
  kind: ConnectionKind;
  bus?: string;
  label?: string;
  direction?: "forward" | "both";
  scope: string;
  range: SourceRange;
};
export type SystemAlias = { from: string; to: string; range: SourceRange };
export type ResolvedSystem = {
  schema: "circuitkit.system.v1";
  id: string;
  title: string;
  view: DiagramView;
  theme: Theme;
  nodes: SystemNode[];
  connections: SystemConnection[];
  aliases: SystemAlias[];
  nets: { id: string; pins: string[] }[];
};
export type SourceOptions = {
  view?: DiagramView;
  theme?: Theme;
  scope?: string;
  detail?: "expanded" | "interface";
};
export type SourceSelection = {
  scope: string;
  detail: "expanded" | "interface";
  modulePaths: Record<string, string>;
  boundaryPorts: { port: string; endpoint: string }[];
  limits: "per-projection";
  omittedInternalConnections: number;
};
export const languageLimits = Object.freeze({
  bytes: 65536,
  tokens: 16384,
  declarations: 512,
  definitions: 32,
  depth: 8,
  expandedModules: 256,
  expandedPorts: 2048,
  expandedConnections: 2048,
  presentationSections: 32,
  presentationScenes: 16,
  presentationSelectors: 256,
  presentationFlows: 32,
});
