import type { Point, Scene } from "./scene.ts";
import type { FigureDocument } from "./schema.ts";
import { annotationPalettes, contrast, type Theme } from "./theme.ts";
import type {
  Box,
  Diagnostic,
  FigureBounds,
  ResolvedAnnotations,
  ResolvedNetAnnotation,
} from "./types.ts";
import { escapeXML, number, textPath } from "./typography.ts";

export const conductorPath = (points: readonly Point[]) =>
  points.map(([x, y], index) => `${index === 0 ? "M" : "L"}${number(x)} ${number(y)}`).join("");

export const annotationHaloWidth = (theme: Theme) => theme.strokeWidth * 4;

const expand = (box: Box, padding: number): Box => ({
  x: box.x - padding,
  y: box.y - padding,
  width: box.width + padding * 2,
  height: box.height + padding * 2,
});
const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
const inside = (box: Box, region: Box) =>
  Object.values(box).every(Number.isFinite) &&
  box.width > 0 &&
  box.height > 0 &&
  box.x >= region.x &&
  box.y >= region.y &&
  box.x + box.width <= region.x + region.width &&
  box.y + box.height <= region.y + region.height;
const segmentBox = (a: Point, b: Point, padding: number) =>
  expand(
    {
      x: Math.min(a[0], b[0]),
      y: Math.min(a[1], b[1]),
      width: Math.abs(a[0] - b[0]),
      height: Math.abs(a[1] - b[1]),
    },
    padding,
  );

function checkText(text: string, path: string, theme: Theme, diagnostics: Diagnostic[]) {
  if (
    [...text].some((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code < 32 || (code >= 0xd800 && code <= 0xdfff) || code === 0xfffe || code === 0xffff;
    })
  )
    diagnostics.push({
      code: "document.invalid_field",
      path,
      message: "Annotation text cannot contain XML control characters.",
    });
  const measured = textPath(text, "sans", 18 * theme.fontScale, 0, 0);
  if (measured.missing.length)
    diagnostics.push({
      code: "font.missing_glyph",
      path,
      message: `Pinned Geist sans has no supported glyph for ${measured.missing.map((character) => JSON.stringify(character)).join(", ")}.`,
    });
}

export function layoutAnnotationFigure(
  annotations: Pick<ResolvedAnnotations, "legend" | "caption"> & {
    nets: Array<Pick<ResolvedNetAnnotation, "net" | "label" | "description" | "color">>;
  },
  theme: Theme,
  width: number,
  diagramHeight: number,
) {
  const diagnostics: Diagnostic[] = [];
  const labels: Record<string, Box> = Object.create(null);
  const groups: string[] = [];
  const size = 18 * theme.fontScale;
  const lineHeight = size * 1.6;
  const left = 64;
  const available = width - left * 2;
  let top = diagramHeight + 28;
  const paragraph = (value: string, path: string, key: string, color: string, visible: boolean) => {
    const words = value.trim().split(/\s+/u).filter(Boolean);
    const lines: string[] = [];
    let line = "";
    const fits = (text: string) => {
      const measured = textPath(text, "sans", size, 0, 0);
      return (
        Number.isFinite(measured.advance) &&
        measured.advance <= available &&
        Object.values(measured.box).every(Number.isFinite) &&
        measured.box.width <= available &&
        (!measured.svg || (measured.box.width > 0 && measured.box.height > 0))
      );
    };
    for (const word of words) {
      if (!fits(word)) {
        diagnostics.push({
          code: "layout.label_collision",
          path,
          message: `Unbreakable annotation word ${JSON.stringify(word)} does not fit the figure text area.`,
        });
        return;
      }
      const candidate = line ? `${line} ${word}` : word;
      if (line && !fits(candidate)) {
        lines.push(line);
        line = word;
      } else line = candidate;
    }
    if (line) lines.push(line);
    if (!visible || !lines.length) return;
    const paths: string[] = [];
    for (const [index, text] of lines.entries()) {
      const metrics = textPath(text, "sans", size, 0, 0);
      const rendered = textPath(text, "sans", size, left - metrics.box.x, top - metrics.box.y);
      if (!inside(rendered.box, { x: left, y: top, width: available, height: lineHeight }))
        diagnostics.push({
          code: "layout.label_collision",
          path,
          message: "Annotation text has nonrepresentable or overflowing figure geometry.",
        });
      labels[`${key}:${index}`] = rendered.box;
      paths.push(rendered.svg);
      top += lineHeight;
    }
    groups.push(
      `<g data-${key === "caption" ? 'caption="true"' : `legend-net="${escapeXML(key.slice(7))}"`} fill="${color}">${paths.join("")}</g>`,
    );
    top += 12;
  };
  for (const [index, annotation] of annotations.nets.entries()) {
    checkText(
      annotation.label,
      `/presentation/annotations/nets/${index}/label`,
      theme,
      diagnostics,
    );
    checkText(
      annotation.description,
      `/presentation/annotations/nets/${index}/description`,
      theme,
      diagnostics,
    );
    paragraph(
      `${annotation.label}: ${annotation.description}`,
      `/presentation/annotations/nets/${index}/description`,
      `legend:${annotation.net}`,
      annotation.color,
      annotations.legend,
    );
  }
  checkText(annotations.caption, "/presentation/annotations/caption", theme, diagnostics);
  paragraph(annotations.caption, "/presentation/annotations/caption", "caption", theme.label, true);
  const height = groups.length ? top + 24 : diagramHeight;
  if (!Number.isFinite(height))
    diagnostics.push({
      code: "layout.label_collision",
      path: "/presentation/annotations",
      message: "Figure annotation height must be finite.",
    });
  return { svg: groups.join(""), height, labels, diagnostics };
}

export function resolveAnnotations(
  document: FigureDocument,
  scene: Scene,
  theme: Theme,
  bounds: FigureBounds,
  region: Box,
) {
  const config = document.presentation.annotations;
  if (!config) return undefined;
  const diagnostics: Diagnostic[] = [];
  const nets: ResolvedNetAnnotation[] = [];
  const labels: string[] = [];
  const halo = annotationHaloWidth(theme);
  const conductors = [
    ...scene.routes,
    ...(scene.leads ?? []).flatMap((lead) => {
      const owner = scene.endpoints[lead.endpoint];
      if (!owner) {
        diagnostics.push({
          code: "annotation.unknown_net",
          path: "/layout",
          message: `Lead ${JSON.stringify(lead.endpoint)} has no endpoint owner.`,
        });
        return [];
      }
      return [{ net: owner.net, points: lead.points }];
    }),
  ];
  const obstacles = [
    ...Object.values(bounds.labels).map((box) => expand(box, 4)),
    ...Object.values(bounds.symbols).map((box) => expand(box, halo / 2)),
    ...conductors.flatMap(({ points }) =>
      points.slice(1).map((b, index) => segmentBox(points[index] ?? b, b, halo / 2 + 4)),
    ),
    ...[...scene.dots, ...scene.terminals].map(({ point: [x, y] }) =>
      expand({ x, y, width: 0, height: 0 }, 4 + halo / 2),
    ),
  ];
  for (const [index, annotation] of config.nets.entries()) {
    const path = `/presentation/annotations/nets/${index}`;
    const color = annotationPalettes[document.presentation.theme.preset][annotation.tone];
    if (contrast(color, theme.background) < 4.5)
      diagnostics.push({
        code: "theme.insufficient_contrast",
        path: `${path}/tone`,
        message: `Annotation tone ${annotation.tone} must meet 4.5:1 label and 3:1 conductor contrast against the background.`,
      });
    const routes = conductors.filter(({ net }) => net === annotation.net);
    const segments = routes.flatMap(({ points }) =>
      points.slice(1).map((b, i) => ({ a: points[i] ?? b, b })),
    );
    const metrics = textPath(annotation.label, "sans", 20 * theme.fontScale, 0, 0);
    let placed: ReturnType<typeof textPath> | undefined;
    for (const { a, b } of segments) {
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (!length) continue;
      const nx = -(b[1] - a[1]) / length;
      const ny = (b[0] - a[0]) / length;
      const clearance =
        (Math.abs(nx) * metrics.box.width) / 2 +
        (Math.abs(ny) * metrics.box.height) / 2 +
        halo / 2 +
        8;
      for (const fraction of [0.5, 0.25, 0.75, 0, 1]) {
        for (const extra of [0, 12, 24]) {
          for (const side of [-1, 1]) {
            const x = a[0] + (b[0] - a[0]) * fraction + nx * (clearance + extra) * side;
            const y = a[1] + (b[1] - a[1]) * fraction + ny * (clearance + extra) * side;
            const text = textPath(
              annotation.label,
              "sans",
              20 * theme.fontScale,
              x - metrics.box.x - metrics.box.width / 2,
              y - metrics.box.y - metrics.box.height / 2,
            );
            if (inside(text.box, region) && !obstacles.some((box) => overlaps(text.box, box))) {
              placed = text;
              break;
            }
          }
          if (placed) break;
        }
        if (placed) break;
      }
      if (placed) break;
    }
    if (!placed) {
      diagnostics.push({
        code: "layout.label_collision",
        path: `${path}/label`,
        message: `No collision-free measured annotation position for ${JSON.stringify(annotation.label)} inside the scene region.`,
      });
      continue;
    }
    bounds.labels[`annotation:${index}`] = placed.box;
    obstacles.push(expand(placed.box, 4));
    labels.push(
      `<g data-net-label="${escapeXML(annotation.net)}" fill="${color}">${placed.svg}</g>`,
    );
    nets.push({
      ...annotation,
      color,
      paths: routes.map(({ points }) => conductorPath(points)),
      segments,
      labelBounds: placed.box,
    });
  }
  const annotations: ResolvedAnnotations = {
    nets,
    legend: config.legend,
    caption: config.caption ?? "",
  };
  const composition = layoutAnnotationFigure(
    {
      ...annotations,
      nets: config.nets.map((annotation) => ({
        ...annotation,
        color: annotationPalettes[document.presentation.theme.preset][annotation.tone],
      })),
    },
    theme,
    bounds.width,
    bounds.height,
  );
  diagnostics.push(...composition.diagnostics);
  return { annotations, labels: labels.join(""), diagnostics };
}
