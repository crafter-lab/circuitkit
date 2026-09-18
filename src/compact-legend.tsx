"use client";

import type { CSSProperties } from "react";
import type { ResolvedAnnotations } from "./types.ts";

interface CompactLegendProps {
  id: string;
  diagramId: string;
  annotations?: ResolvedAnnotations;
  selected: readonly string[];
  preview?: string;
  interactive: boolean;
  notes: boolean;
  showDescription: boolean;
  buttonStyle: CSSProperties;
  onClear: () => void;
  onDownload?: () => void;
}

export function CompactLegend({
  id,
  diagramId,
  annotations,
  selected,
  preview,
  interactive,
  notes,
  showDescription,
  buttonStyle,
  onClear,
  onDownload,
}: CompactLegendProps) {
  const current = annotations?.nets.find(
    ({ net }) => net === (preview ?? (selected.length === 1 ? selected[0] : undefined)),
  );
  const hasNotes = notes && Boolean(annotations?.legend || annotations?.caption);
  const descriptions = annotations?.nets.filter((annotation) => annotation.description) ?? [];
  return (
    <>
      {annotations?.nets.length || hasNotes || onDownload ? (
        <div
          className="circuit-lesson-compact-chrome"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "10px 12px",
            flexWrap: "wrap",
          }}
        >
          <ul
            className="circuit-lesson-static-legend"
            aria-label="Connection legend"
            style={{
              display: "flex",
              alignItems: "center",
              flex: 1,
              gap: 16,
              listStyle: "none",
              padding: 0,
              margin: 0,
              fontSize: 12,
              flexWrap: "wrap",
            }}
          >
            {annotations?.nets.map((annotation, index) => (
              <li
                key={annotation.net}
                data-legend-net={annotation.net}
                id={`${id}-net-${index}`}
                style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 500 }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: annotation.color,
                    flexShrink: 0,
                  }}
                />
                {annotation.label}
                <span style={{ fontWeight: 400 }}>{annotation.net}</span>
              </li>
            ))}
          </ul>
          {interactive && annotations?.nets.length ? (
            <button
              type="button"
              className="circuit-lesson-reset"
              style={{
                ...buttonStyle,
                visibility: selected.length ? "visible" : "hidden",
                fontSize: 12,
              }}
              aria-controls={diagramId}
              disabled={!selected.length}
              onClick={onClear}
            >
              Reset
            </button>
          ) : null}
          {hasNotes ? (
            <details className="circuit-lesson-notes" style={{ position: "relative" }}>
              <summary style={{ ...buttonStyle, cursor: "pointer", fontSize: 12 }}>Notes</summary>
              <div
                className="circuit-lesson-notes-content"
                style={{
                  position: "absolute",
                  right: 0,
                  bottom: "calc(100% + 8px)",
                  width: 280,
                  maxWidth: "80vw",
                  maxHeight: 280,
                  overflowY: "auto",
                  padding: 16,
                  background: buttonStyle.background,
                  border: buttonStyle.border,
                  zIndex: 5,
                  fontSize: 13,
                }}
              >
                {annotations?.legend ? (
                  <dl style={{ margin: 0 }}>
                    {annotations.nets.map((annotation) => (
                      <div key={annotation.net}>
                        <dt style={{ color: annotation.color }}>{annotation.label}</dt>
                        <dd style={{ margin: "0 0 8px" }}>{annotation.description}</dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
                {annotations?.caption ? (
                  <p className="circuit-lesson-caption" style={{ margin: "8px 0" }}>
                    {annotations.caption}
                  </p>
                ) : null}
              </div>
            </details>
          ) : null}
          {onDownload ? (
            <button
              type="button"
              className="circuit-lesson-download"
              aria-label="Download figure SVG"
              style={{ ...buttonStyle, cursor: "pointer", fontSize: 12 }}
              onClick={onDownload}
            >
              SVG
            </button>
          ) : null}
        </div>
      ) : null}
      {showDescription && descriptions.length ? (
        <div
          className="circuit-lesson-description-slot"
          style={{ display: "grid", padding: "0 12px 12px", fontSize: 13, lineHeight: 1.6 }}
        >
          <p
            style={{
              gridArea: "1 / 1",
              margin: 0,
              visibility: current?.description ? "hidden" : "visible",
            }}
            aria-hidden={Boolean(current?.description)}
          >
            {interactive
              ? "Point to a wire, or focus the diagram and use arrow keys. Enter selects; Escape clears."
              : "Connection details"}
          </p>
          {descriptions.map((annotation) => (
            <p
              key={annotation.net}
              className="circuit-lesson-description"
              style={{
                gridArea: "1 / 1",
                margin: 0,
                visibility: current?.net === annotation.net ? "visible" : "hidden",
              }}
              aria-hidden={current?.net !== annotation.net}
            >
              {annotation.description}
            </p>
          ))}
        </div>
      ) : null}
    </>
  );
}
