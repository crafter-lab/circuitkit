import { type ReactNode, useMemo } from "react";
import type { Box } from "../types.ts";
import type { Selection } from "./circuit.ts";

export function CircuitCanvas({
  svg,
  bounds,
  title,
  targets,
  nets,
  selection,
  onSelect,
  children,
}: {
  svg: string;
  bounds: Box;
  title: string;
  targets: { selection: NonNullable<Selection>; bounds: Box }[];
  nets: string[];
  selection: Selection;
  onSelect: (selection: Selection) => void;
  children?: ReactNode;
}) {
  const paths = useMemo(() => {
    const document = new DOMParser().parseFromString(svg, "image/svg+xml");
    const byNet = new Map<string, string[]>();
    const allowed = new Set(nets);
    for (const path of document.querySelectorAll("path[data-net]")) {
      const net = path.getAttribute("data-net");
      const d = path.getAttribute("d");
      if (net && d && allowed.has(net)) {
        const group = byNet.get(net) ?? [];
        group.push(d);
        byNet.set(net, group);
      }
    }
    return [...byNet];
  }, [svg, nets]);
  return (
    <div className="circuit-canvas">
      <img
        src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`}
        alt={`${title}. Declared circuit connections.`}
      />
      {paths.map(([net, routes]) => (
        <button
          key={net}
          type="button"
          className="net-hit"
          aria-label={`Net ${net}`}
          aria-pressed={selection?.kind === "net" && selection.id === net}
          onClick={() => onSelect({ kind: "net", id: net })}
        >
          <svg
            className="net-layer"
            aria-hidden="true"
            viewBox={`${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`}
          >
            {routes.map((d, index) => (
              <path
                key={`${index}:${d}`}
                d={d}
                fill="none"
                stroke="transparent"
                strokeWidth={18}
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>
        </button>
      ))}
      {children}
      {targets.map(({ selection: target, bounds: box }) => (
        <button
          type="button"
          key={`${target.kind}:${target.id}`}
          className="component-hit"
          aria-label={target.id}
          title={target.id}
          aria-pressed={selection?.kind === target.kind && selection.id === target.id}
          style={{
            left: `${((box.x + box.width / 2 - bounds.x) / bounds.width) * 100}%`,
            top: `${((box.y + box.height / 2 - bounds.y) / bounds.height) * 100}%`,
            width: `${((box.width + 12) / bounds.width) * 100}%`,
            height: `${((box.height + 12) / bounds.height) * 100}%`,
          }}
          onClick={() => onSelect(target)}
        />
      ))}
    </div>
  );
}
