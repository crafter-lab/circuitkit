const keywords = new Set([
  "circuit",
  "title",
  "view",
  "theme",
  "bus",
  "power",
  "ground",
  "audio",
  "signal",
  "define",
  "expose",
  "as",
  "presentation",
  "section",
  "scene",
  "highlight",
  "dim",
  "others",
  "flow",
  "style",
  "period",
  "direction",
  "port",
  "link",
]);
const kinds = new Set([
  "module",
  "source",
  "connector",
  "controller",
  "sensor",
  "display",
  "amplifier",
  "speaker",
  "load",
  "schematic",
  "wiring",
  "blocks",
]);
const escapeHTML = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
function category(value: string, before: string | undefined) {
  if (value.startsWith("#")) return "comment";
  if (value.startsWith('"')) return "string";
  if (["<->", "->", "--", "="].includes(value)) return "operator";
  if (keywords.has(value)) return "keyword";
  if (kinds.has(value)) return "type";
  if (/^v\d+$/.test(value)) return "number";
  if (/^[{}():.=]$/.test(value)) return "punctuation";
  return before === "." ? "port" : "identifier";
}
export function highlightCircuitSource(source: string): string {
  if (typeof source !== "string" || source.length > 1024 * 1024) return "";
  if (source.length > 65536) return escapeHTML(source);
  const pattern =
    /"(?:\\.|[^"\\\r\n])*(?:"|(?=\r?\n|$))|#[^\r\n]*|<->|->|--|\b[A-Za-z_][A-Za-z0-9_/-]*\b|[{}():.=]/g;
  let result = "",
    cursor = 0;
  for (const match of source.matchAll(pattern)) {
    result += escapeHTML(source.slice(cursor, match.index));
    result += `<span class="ck-token ck-${category(match[0], source[match.index - 1])}">${escapeHTML(match[0])}</span>`;
    cursor = match.index + match[0].length;
  }
  return result + escapeHTML(source.slice(cursor));
}
