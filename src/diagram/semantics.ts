import { reject } from "./safety.ts";
import type {
  ConnectionKind,
  DiagramConnection,
  NormalizedDiagramDocument as DiagramDocument,
  DiagramModule,
  DiagramPort,
} from "./schema.ts";

export const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export function token(value: string): string {
  let hash = 0x6c62272e07bb014262b821756295c58dn;
  for (const character of value) {
    hash ^= BigInt(character.codePointAt(0) ?? 0);
    hash = BigInt.asUintN(128, hash * 0x1000000000000000000013bn);
  }
  return `h${hash.toString(16).padStart(32, "0")}`;
}

export type DiagramNet = {
  id: string;
  label: string;
  pins: string[];
  connections: string[];
  kinds: ConnectionKind[];
  buses: string[];
  labels: string[];
};
export type DiagramSemantics = { nets: DiagramNet[] };
export type Pin = { reference: string; module: DiagramModule; port: DiagramPort; target: string };
export type Edge = DiagramConnection & { id: string; arrowFrom?: string };
export type Model = {
  document: DiagramDocument;
  modules: DiagramModule[];
  pins: Pin[];
  edges: Edge[];
  nets: DiagramNet[];
  netByPin: Map<string, DiagramNet>;
  pinByReference: Map<string, Pin>;
};

export function semanticModel(document: DiagramDocument): Model {
  const identities = new Map<string, string>();
  const identity = (kind: string, content: string) => {
    const id = `${document.id}/${kind}/${token(content)}`;
    const previous = identities.get(id);
    if (previous !== undefined && previous !== content)
      reject(
        "diagram.identity",
        "",
        "Semantic identity collision; change one authored identifier.",
      );
    identities.set(id, content);
    return id;
  };
  const modules = [...document.modules].sort((a, b) => compare(a.id, b.id));
  const pins = modules.flatMap((module) =>
    [...module.ports]
      .sort((a, b) => compare(a.id, b.id))
      .map((port): Pin => {
        const reference = `${module.id}.${port.id}`;
        return { reference, module, port, target: identity("terminal", reference) };
      }),
  );
  const pinByReference = new Map(pins.map((pin) => [pin.reference, pin]));
  const parents = new Map(pins.map((pin) => [pin.reference, pin.reference]));
  const root = (pin: string): string => {
    const parent = parents.get(pin);
    if (!parent) reject("diagram.reference", "", `Unknown endpoint '${pin}'.`);
    if (parent === pin) return pin;
    const result = root(parent);
    parents.set(pin, result);
    return result;
  };
  const edges = document.connections
    .map((connection): Edge => {
      const [from, to] = [connection.from, connection.to].sort(compare) as [string, string];
      return {
        ...connection,
        from,
        to,
        id: identity("route", JSON.stringify([from, to])),
        ...(connection.direction === "forward" ? { arrowFrom: connection.from } : {}),
      };
    })
    .sort((a, b) => compare(a.from, b.from) || compare(a.to, b.to));
  for (const edge of edges) {
    const a = root(edge.from);
    const b = root(edge.to);
    if (a !== b) parents.set(compare(a, b) < 0 ? b : a, compare(a, b) < 0 ? a : b);
  }
  const groups = new Map<string, string[]>();
  for (const pin of pins) {
    const key = root(pin.reference);
    const members = groups.get(key) ?? [];
    members.push(pin.reference);
    groups.set(key, members);
  }
  const unique = <T extends string>(items: T[]): T[] => [...new Set(items)].sort(compare);
  const nets = [...groups.values()]
    .sort((a, b) => compare(a[0] ?? "", b[0] ?? ""))
    .map((members, index): DiagramNet => {
      const connected = edges.filter((edge) => root(edge.from) === root(members[0] ?? ""));
      return {
        id: identity("net", JSON.stringify(members)),
        label: `N${index + 1}`,
        pins: members,
        connections: connected.map((edge) => edge.id),
        kinds: unique(connected.map((edge) => edge.kind)),
        buses: unique(connected.flatMap((edge) => (edge.bus ? [edge.bus] : []))),
        labels: unique(connected.flatMap((edge) => (edge.label ? [edge.label] : []))),
      };
    });
  const netByPin = new Map(nets.flatMap((net) => net.pins.map((pin) => [pin, net] as const)));
  return { document, modules, pins, edges, nets, netByPin, pinByReference };
}
