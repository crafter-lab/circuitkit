"use client";

import { type ReactNode, type SVGProps, useEffect, useId, useMemo, useRef, useState } from "react";
import { themes } from "../theme.ts";
import { number } from "../typography.ts";
import { mathGeometry } from "./math-text.ts";
import { renderEducationalSVG, targetDOMId } from "./render.ts";
import type { Diagnostic } from "./safety.ts";
import type { PublicFigure, Shape } from "./schema.ts";

const contactRoles = new Set(["terminal", "contact", "pin"]);
const wireRoles = new Set(["route", "probe", "trace", "axis", "edge"]);

function memberShape(shape: Shape, key: string): ReactNode {
  if (shape.kind === "math") {
    return (
      <g key={key}>
        {Array.from(
          mathGeometry(shape).paths.matchAll(
            /<path d="([^"]+)"(?: fill-rule="(evenodd|nonzero)")? transform="([^"]+)"\/>/g,
          ),
          (match) => (
            <path
              key={match.index}
              d={match[1]}
              transform={match[3]}
              fillRule={match[2] === "evenodd" ? "evenodd" : "nonzero"}
              fill="currentColor"
            />
          ),
        )}
      </g>
    );
  }
  const common = {
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    fill: shape.kind === "line" || shape.fill === "none" ? "none" : "currentColor",
  };
  if (shape.kind === "line" || shape.kind === "polygon") {
    return (
      <path
        key={key}
        {...common}
        d={
          shape.points
            .map(
              (point, index) => `${index === 0 ? "M" : "L"}${number(point.x)} ${number(point.y)}`,
            )
            .join("") + (shape.kind === "polygon" ? "Z" : "")
        }
        strokeWidth={number(shape.width)}
        strokeDasharray={shape.kind === "line" && shape.dashed ? "5 4" : undefined}
      />
    );
  }
  if (shape.kind === "circle") {
    return (
      <circle
        key={key}
        {...common}
        cx={number(shape.at.x)}
        cy={number(shape.at.y)}
        r={number(shape.radius)}
        strokeWidth={number(shape.stroke)}
      />
    );
  }
  return (
    <rect
      key={key}
      {...common}
      x={number(shape.at.x)}
      y={number(shape.at.y)}
      width={number(shape.width)}
      height={number(shape.height)}
      rx={number(shape.radius)}
      strokeWidth={number(shape.stroke)}
    />
  );
}

export interface EducationalFigureProps {
  document: PublicFigure | unknown;
  namespace?: string;
  className?: string;
  selectedTargets?: readonly string[];
  onSelectionChange?: (ids: string[]) => void;
  onDiagnostics?: (diagnostics: Diagnostic[]) => void;
  caption?: ReactNode;
}

export function EducationalFigure({
  document,
  namespace,
  className,
  selectedTargets = [],
  onSelectionChange,
  onDiagnostics,
  caption,
}: EducationalFigureProps) {
  const instanceId = useId();
  const [focusedTarget, setFocusedTarget] = useState<string | null>(null);
  const rendered = useMemo(() => {
    const result = renderEducationalSVG(
      document,
      namespace === undefined ? undefined : { namespace },
    );
    const parts = new Map(result.ok ? result.document.display.map((part) => [part.id, part]) : []);
    const preciseTargets = new Set(
      result.ok
        ? result.targets
            .filter(
              (target) =>
                target.role !== "net" &&
                (wireRoles.has(target.role) ||
                  contactRoles.has(target.role) ||
                  parts.get(target.id)?.shapes.every((shape) => shape.kind === "line")),
            )
            .map((target) => target.id)
        : [],
    );
    const members = new Set(
      result.ok
        ? result.targets.flatMap((target) =>
            target.role === "net"
              ? target.members
              : preciseTargets.has(target.id)
                ? [target.id]
                : [],
          )
        : [],
    );
    return {
      result,
      image:
        result.ok && result.svg
          ? `data:image/svg+xml,${encodeURIComponent(result.svg)}`
          : undefined,
      memberShapes: new Map(
        result.ok
          ? result.document.display
              .filter((part) => members.has(part.id))
              .map((part) => {
                const occurrences = new Map<string, number>();
                const shapes = part.shapes.map((shape) => {
                  const signature = JSON.stringify(shape);
                  const occurrence = occurrences.get(signature) ?? 0;
                  occurrences.set(signature, occurrence + 1);
                  return memberShape(shape, `${signature}:${occurrence}`);
                });
                return [part.id, shapes] as const;
              })
          : [],
      ),
      individualTargets: new Set(
        result.ok
          ? result.targets.filter((target) => target.role !== "net").map((target) => target.id)
          : [],
      ),
      preciseTargets,
      contacts: result.ok
        ? result.targets
            .filter((target) => contactRoles.has(target.role))
            .sort((a, b) => b.bounds.width * b.bounds.height - a.bounds.width * a.bounds.height)
        : [],
    };
  }, [document, namespace]);
  const { result, image, memberShapes, individualTargets, preciseTargets, contacts } = rendered;

  const diagnosticsCallback = useRef(onDiagnostics);

  useEffect(() => {
    diagnosticsCallback.current = onDiagnostics;
  }, [onDiagnostics]);

  useEffect(() => {
    diagnosticsCallback.current?.(result.diagnostics.map((diagnostic) => ({ ...diagnostic })));
  }, [result]);

  useEffect(() => {
    if (
      focusedTarget !== null &&
      (!result.ok ||
        !onSelectionChange ||
        !result.targets.some((target) => target.id === focusedTarget))
    ) {
      setFocusedTarget(null);
    }
  }, [result, onSelectionChange, focusedTarget]);

  if (!result.ok) {
    return (
      <figure className={className} style={{ margin: 0, minWidth: 0, maxWidth: "100%" }}>
        <p role="alert">Figure unavailable. {result.diagnostics[0]?.message}</p>
        {caption != null ? <figcaption>{caption}</figcaption> : null}
      </figure>
    );
  }

  if (result.svg === "") {
    return caption != null ? (
      <figure className={className} style={{ margin: 0, minWidth: 0, maxWidth: "100%" }}>
        <figcaption>{caption}</figcaption>
      </figure>
    ) : null;
  }

  const domNamespace = `r${Array.from(instanceId)
    .map((character) => character.charCodeAt(0).toString(16).padStart(4, "0"))
    .join("")}-${namespace ?? "figure"}`;
  const titleId = `edu-${domNamespace}-title`;
  const descriptionId = `edu-${domNamespace}-desc`;
  const instructionsId = `edu-${domNamespace}-instructions`;
  const { bounds, targets } = result;
  const requested = new Set(selectedTargets);
  const selected = targets.filter((target) => requested.has(target.id)).map((target) => target.id);
  const selectedSet = new Set(selected);
  const interactive = onSelectionChange !== undefined && targets.length > 0;
  const highlight = themes[result.document.theme].highlight;
  const description = [
    result.document.description,
    ...result.document.display.flatMap((part) =>
      part.shapes.flatMap((shape) =>
        shape.kind === "math" ? [shape.runs.map((run) => run.text).join("")] : [],
      ),
    ),
    ...targets.map((target) => target.label),
  ]
    .filter(Boolean)
    .join("; ");
  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectionChange?.(targets.filter((target) => next.has(target.id)).map((target) => target.id));
  };

  return (
    <figure className={className} style={{ margin: 0, minWidth: 0, maxWidth: "100%" }}>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        data-educational-namespace={domNamespace}
        viewBox={[bounds.x, bounds.y, bounds.width, bounds.height].map(number).join(" ")}
        width={number(bounds.width)}
        height={number(bounds.height)}
        style={{ display: "block", maxWidth: "100%", height: "auto" }}
        role={interactive ? "group" : "img"}
        aria-labelledby={titleId}
        aria-describedby={`${descriptionId}${interactive ? ` ${instructionsId}` : ""}`}
      >
        <title id={titleId}>{result.document.title}</title>
        <desc id={descriptionId}>{description}</desc>
        {interactive ? (
          <desc id={instructionsId}>
            Tab to a target. Enter or Space toggles selection. Escape clears selection.
          </desc>
        ) : null}
        <image
          href={image}
          x={number(bounds.x)}
          y={number(bounds.y)}
          width={number(bounds.width)}
          height={number(bounds.height)}
          aria-hidden="true"
          tabIndex={-1}
          focusable="false"
          pointerEvents="none"
        />
        {targets.map((target) => {
          const pressed = selectedSet.has(target.id);
          const focused = interactive && focusedTarget === target.id;
          const box = {
            x: number(target.bounds.x),
            y: number(target.bounds.y),
            width: number(target.bounds.width),
            height: number(target.bounds.height),
          };
          const identity = {
            id: targetDOMId(domNamespace, target.id),
            "data-target": target.id,
            "data-kind": target.role === "net" ? "group" : undefined,
            "data-selected": pressed ? "true" : "false",
          };
          const overlay =
            target.role === "net" ? (
              <g
                color={pressed ? highlight : "transparent"}
                fillOpacity={0.16}
                pointerEvents="none"
              >
                {target.members.map((member) => (
                  <g
                    key={member}
                    data-member={member}
                    pointerEvents={
                      interactive && !individualTargets.has(member) ? "painted" : "none"
                    }
                  >
                    {memberShapes.get(member)}
                  </g>
                ))}
              </g>
            ) : preciseTargets.has(target.id) ? (
              <g
                data-shape-target={target.id}
                color={pressed ? highlight : "transparent"}
                fillOpacity={0.16}
                pointerEvents={interactive && !contactRoles.has(target.role) ? "painted" : "none"}
              >
                {memberShapes.get(target.id)}
              </g>
            ) : (
              <rect
                {...box}
                fill={pressed ? highlight : "transparent"}
                fillOpacity={pressed ? 0.16 : 0}
                stroke={pressed ? highlight : "none"}
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
                pointerEvents={interactive ? "all" : "none"}
              />
            );
          if (!interactive) {
            return (
              <g key={target.id} {...identity} aria-hidden="true" tabIndex={-1}>
                {overlay}
              </g>
            );
          }
          const control: SVGProps<SVGGElement> = {
            role: "button",
            "aria-label": target.label,
            "aria-pressed": pressed,
            tabIndex: 0,
            style: { cursor: "pointer", outline: "none" },
            onFocus: () => setFocusedTarget(target.id),
            onBlur: () => setFocusedTarget(null),
            onPointerDown: (event) => event.preventDefault(),
            onClick: (event) => {
              event.currentTarget.focus();
              toggle(target.id);
            },
            onKeyDown: (event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                if (!event.repeat) onSelectionChange?.([]);
              } else if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                if (!event.repeat) toggle(target.id);
              }
            },
          };
          return (
            <g key={target.id} {...identity} {...control}>
              {overlay}
              {focused ? (
                <g aria-hidden="true" tabIndex={-1} pointerEvents="none" data-focus-ring="true">
                  <rect
                    {...box}
                    fill="none"
                    stroke="white"
                    strokeWidth={4}
                    vectorEffect="non-scaling-stroke"
                  />
                  <rect
                    {...box}
                    fill="none"
                    stroke="black"
                    strokeWidth={2}
                    strokeDasharray="3 2"
                    vectorEffect="non-scaling-stroke"
                  />
                </g>
              ) : null}
            </g>
          );
        })}
        {interactive ? (
          <g
            aria-hidden="true"
            tabIndex={-1}
            data-contact-hits="true"
            color="transparent"
            pointerEvents="none"
          >
            {contacts.map((target) => {
              const pointer: SVGProps<SVGGElement> = {
                pointerEvents: "painted",
                style: { cursor: "pointer" },
                onPointerDown: (event) => event.preventDefault(),
                onClick: (event) => {
                  event.currentTarget.ownerDocument
                    .getElementById(targetDOMId(domNamespace, target.id))
                    ?.focus();
                  toggle(target.id);
                },
              };
              return (
                <g key={target.id} data-hit-target={target.id} {...pointer}>
                  {memberShapes.get(target.id)}
                </g>
              );
            })}
          </g>
        ) : null}
      </svg>
      {caption != null ? <figcaption>{caption}</figcaption> : null}
    </figure>
  );
}
