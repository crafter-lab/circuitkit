import { themes } from "../theme.ts";
import { escapeXML, number } from "../typography.ts";
import { mathGeometry } from "./math-text.ts";
import { boundedJSON, failure, type Result, requireModel, unique } from "./safety.ts";
import {
  type PublicFigure,
  type PublicTargetDefinition,
  publicSchema,
  type Shape,
} from "./schema.ts";

export type Bounds = { x: number; y: number; width: number; height: number };
export type PublicTarget = PublicTargetDefinition & { bounds: Bounds };
export const unionBounds = (boxes: Bounds[]): Bounds => {
  requireModel(boxes.length > 0, "layout.empty");
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  const right = Math.max(...boxes.map((b) => b.x + b.width));
  const bottom = Math.max(...boxes.map((b) => b.y + b.height));
  return { x, y, width: right - x, height: bottom - y };
};
const expand = (b: Bounds, padding: number): Bounds => ({
  x: b.x - padding,
  y: b.y - padding,
  width: b.width + padding * 2,
  height: b.height + padding * 2,
});

function shapeGeometry(shape: Shape): { bounds: Bounds; paths?: string } {
  if (shape.kind === "math") return mathGeometry(shape);
  if (shape.kind === "circle")
    return {
      bounds: expand(
        {
          x: shape.at.x - shape.radius,
          y: shape.at.y - shape.radius,
          width: shape.radius * 2,
          height: shape.radius * 2,
        },
        shape.stroke / 2,
      ),
    };
  if (shape.kind === "rect")
    return {
      bounds: expand(
        { x: shape.at.x, y: shape.at.y, width: shape.width, height: shape.height },
        shape.stroke / 2,
      ),
    };
  const box = unionBounds(shape.points.map((p) => ({ x: p.x, y: p.y, width: 0, height: 0 })));
  return { bounds: expand(box, shape.width / 2) };
}

export function publicLayout(document: PublicFigure) {
  unique(document.display.map((part) => part.id));
  unique(document.targets.map((target) => target.id));
  const shapes = document.display.flatMap((part) => part.shapes);
  requireModel(shapes.length <= 8192, "layout.shape-limit");
  requireModel(
    shapes.reduce(
      (n, s) => n + (s.kind === "math" ? s.runs.reduce((m, r) => m + r.text.length, 0) : 0),
      0,
    ) <= 16000,
    "layout.text-limit",
  );
  requireModel(
    shapes.reduce(
      (n, s) => n + (s.kind === "line" || s.kind === "polygon" ? s.points.length : 0),
      0,
    ) <= 32768,
    "layout.point-limit",
  );
  const parts = document.display.map((part) => {
    const geometry = part.shapes.map(shapeGeometry);
    return { part, geometry, bounds: unionBounds(geometry.map((g) => g.bounds)) };
  });
  requireModel(
    parts.reduce(
      (total, part) =>
        total + part.geometry.reduce((n, shape) => n + (shape.paths?.length ?? 0), 0),
      0,
    ) <= 4000000,
    "layout.glyph-budget",
  );
  const boxes = new Map(parts.map((part) => [part.part.id, part.bounds]));
  const claimedMembers = new Set<string>();
  requireModel(
    document.targets.reduce(
      (n, target) => n + (target.role === "net" ? target.members.length : 0),
      0,
    ) <= 2048,
    "target.member-limit",
  );
  const targets: PublicTarget[] = document.targets.map((target) => {
    if (target.role === "net") {
      const identity = target.id.match(
        /^([A-Za-z][A-Za-z0-9_-]{0,47})\/net\/([A-Za-z][A-Za-z0-9_-]{0,47})$/,
      );
      requireModel(identity && !boxes.has(target.id), "target.group-identity");
      unique(target.members);
      const memberBounds = target.members.map((member) => {
        const part = member.match(
          /^([A-Za-z][A-Za-z0-9_-]{0,47})\/(terminal|route|component)\/([A-Za-z][A-Za-z0-9_-]{0,47})$/,
        );
        requireModel(part && part[1] === identity[1], "target.member-scope");
        const bounds = boxes.get(member);
        requireModel(bounds, "target.member-absent");
        requireModel(!claimedMembers.has(member), "target.ambiguous-membership");
        claimedMembers.add(member);
        return bounds;
      });
      return { ...target, members: [...target.members], bounds: unionBounds(memberBounds) };
    }
    const bounds = boxes.get(target.id);
    requireModel(bounds, "target.absent");
    return { ...target, bounds: { ...bounds } };
  });
  const bounds = parts.length
    ? expand(unionBounds(parts.map((p) => p.bounds)), 2)
    : { x: 0, y: 0, width: 0, height: 0 };
  requireModel(
    Object.values(bounds).every(Number.isFinite) &&
      bounds.width <= 24000 &&
      bounds.height <= 24000 &&
      Math.abs(bounds.x) <= 20000 &&
      Math.abs(bounds.y) <= 20000,
    "layout.bounds",
  );
  return { parts, targets, bounds };
}

export function parsePublic(input: unknown): PublicFigure {
  return publicSchema.parse(boundedJSON(input));
}

export function validateEducational(input: unknown): Result<{ document: PublicFigure }> {
  try {
    const document = parsePublic(input);
    publicLayout(document);
    return { ok: true, document, diagnostics: [] };
  } catch {
    return failure();
  }
}

export function inspectEducational(
  input: unknown,
): Result<{ document: PublicFigure; bounds: Bounds; targets: PublicTarget[] }> {
  try {
    const document = parsePublic(input);
    const { bounds, targets } = publicLayout(document);
    return { ok: true, document, bounds, targets, diagnostics: [] };
  } catch {
    return failure();
  }
}

export const targetDOMId = (namespace: string, semanticId: string) =>
  `edu-${namespace}-part-${Array.from(semanticId)
    .map((c) => c.charCodeAt(0).toString(16).padStart(2, "0"))
    .join("")}`;

export function renderEducationalSVG(
  input: unknown,
  options?: { namespace?: string },
): Result<{ svg: string; bounds: Bounds; document: PublicFigure; targets: PublicTarget[] }> {
  try {
    const supplied = options === undefined ? {} : boundedJSON(options);
    requireModel(
      typeof supplied === "object" && supplied !== null && !Array.isArray(supplied),
      "options.type",
    );
    requireModel(
      Object.keys(supplied).every((k) => k === "namespace"),
      "options.keys",
    );
    const namespace: unknown = Reflect.get(supplied, "namespace") ?? "figure";
    requireModel(
      typeof namespace === "string" && /^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(namespace),
      "options.namespace",
    );
    const document = parsePublic(input);
    const { parts, bounds, targets } = publicLayout(document);
    if (parts.length === 0)
      return { ok: true, svg: "", bounds, document, targets, diagnostics: [] };
    const theme = themes[document.theme];
    const palette = {
      none: "none",
      background: theme.background,
      ink: theme.wire,
      muted: theme.muted,
      accent: theme.highlight,
      positive:
        document.theme === "geist-dark"
          ? "#ff8fba"
          : document.theme === "geist-print"
            ? "#000000"
            : "#be185d",
      negative: theme.wire,
    };
    const allowed = new Map(targets.map((t) => [t.id, t]));
    const members = new Set(
      targets.flatMap((target) => (target.role === "net" ? target.members : [])),
    );
    const groupMarkers = targets
      .filter((target) => target.role === "net")
      .map((target) => {
        const references = target.members.map((member) => targetDOMId(namespace, member)).join(" ");
        return `<g id="${targetDOMId(namespace, target.id)}" data-target="${escapeXML(target.id)}" data-kind="group" data-members="${references}" aria-owns="${references}"/>`;
      })
      .join("");
    const body = parts
      .map(({ part, geometry }) => {
        const target = allowed.get(part.id);
        const attributes = `${target || members.has(part.id) ? ` id="${targetDOMId(namespace, part.id)}"` : ""}${target ? ` data-target="${escapeXML(part.id)}"` : ""}`;
        const paths = part.shapes
          .map((shape, i) => {
            const stroke = palette[shape.tone];
            if (shape.kind === "math") return `<g fill="${stroke}">${geometry[i]?.paths ?? ""}</g>`;
            const base = `stroke="${stroke}" stroke-linecap="round" stroke-linejoin="round"`;
            if (shape.kind === "line" || shape.kind === "polygon") {
              const d =
                shape.points
                  .map((p, i) => `${i === 0 ? "M" : "L"}${number(p.x)} ${number(p.y)}`)
                  .join("") + (shape.kind === "polygon" ? "Z" : "");
              return `<path d="${d}" ${base} stroke-width="${number(shape.width)}" fill="${shape.kind === "polygon" ? palette[shape.fill] : "none"}"${shape.kind === "line" && shape.dashed ? ' stroke-dasharray="5 4"' : ""}/>`;
            }
            const style = `${base} stroke-width="${number(shape.stroke)}" fill="${palette[shape.fill]}"`;
            if (shape.kind === "circle")
              return `<circle cx="${number(shape.at.x)}" cy="${number(shape.at.y)}" r="${number(shape.radius)}" ${style}/>`;
            return `<rect x="${number(shape.at.x)}" y="${number(shape.at.y)}" width="${number(shape.width)}" height="${number(shape.height)}" rx="${number(shape.radius)}" ${style}/>`;
          })
          .join("");
        return `<g${attributes}>${paths}</g>`;
      })
      .join("");
    const visibleText = document.display.flatMap((part) =>
      part.shapes.flatMap((s) => (s.kind === "math" ? [s.runs.map((r) => r.text).join("")] : [])),
    );
    const descriptions = [document.description, ...visibleText, ...targets.map((t) => t.label)]
      .filter(Boolean)
      .join("; ");
    const viewBox = [bounds.x, bounds.y, bounds.width, bounds.height].map(number).join(" ");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${number(bounds.width)}" height="${number(bounds.height)}" role="img" aria-labelledby="edu-${namespace}-title edu-${namespace}-desc"><title id="edu-${namespace}-title">${escapeXML(document.title)}</title><desc id="edu-${namespace}-desc">${escapeXML(descriptions)}</desc><rect x="${number(bounds.x)}" y="${number(bounds.y)}" width="${number(bounds.width)}" height="${number(bounds.height)}" fill="${theme.background}"/><g aria-hidden="true">${body}${groupMarkers}</g></svg>`;
    requireModel(svg.length <= 8000000, "layout.svg-limit");
    return { ok: true, svg, bounds, document, targets, diagnostics: [] };
  } catch {
    return failure();
  }
}
