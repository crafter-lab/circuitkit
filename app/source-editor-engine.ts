import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import {
  bracketMatching,
  HighlightStyle,
  StreamLanguage,
  syntaxHighlighting,
} from "@codemirror/language";
import { Annotation, Compartment, EditorState } from "@codemirror/state";
import {
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import { tags } from "@lezer/highlight";

const external = Annotation.define<boolean>();
const circuit = StreamLanguage.define({
  token(stream) {
    if (stream.eatSpace()) return null;
    if (stream.match(/#.*/)) return "comment";
    if (stream.match(/"(?:[^"\\]|\\.)*"?/)) return "string";
    if (stream.match(/(?:<->|->|--|=)/)) return "operator";
    if (
      stream.match(
        /\b(?:circuit|title|view|theme|bus|define|expose|as|power|ground|signal|audio|presentation|section|scene|highlight|dim|others|flow|style|period|direction|port|link)\b/,
      )
    )
      return "keyword";
    if (
      stream.match(
        /\b(?:module|source|connector|controller|sensor|display|amplifier|speaker|load|schematic|wiring|blocks)\b/,
      )
    )
      return "typeName";
    if (stream.match(/v\d+\b/)) return "number";
    if (stream.match(/[\w/+−-]+/)) return "variableName";
    stream.next();
    return "punctuation";
  },
});
const colors = HighlightStyle.define([
  { tag: tags.keyword, color: "var(--syntax-keyword)" },
  { tag: tags.string, color: "var(--syntax-string)" },
  { tag: tags.variableName, color: "var(--syntax-function)" },
  { tag: tags.number, color: "var(--syntax-number)" },
  { tag: tags.comment, color: "var(--syntax-comment)" },
  { tag: tags.typeName, color: "var(--syntax-type)" },
  { tag: [tags.punctuation, tags.operator], color: "var(--syntax-punctuation)" },
  { tag: tags.heading, fontWeight: "600" },
]);

export function mountSourceEditor(
  parent: HTMLElement,
  options: {
    id: string;
    value: string;
    label: string;
    describedBy?: string;
    invalid: boolean;
    language: "json" | "markdown" | "circuitkit";
    onChange: (value: string) => void;
  },
) {
  const attributes = new Compartment();
  const language = new Compartment();
  const wrapping = new Compartment();
  let label = options.label;
  const attrs = (invalid: boolean) =>
    EditorView.contentAttributes.of({
      id: options.id,
      "aria-label": label,
      "aria-invalid": String(invalid),
      ...(options.describedBy ? { "aria-describedby": options.describedBy } : {}),
      spellcheck: "false",
      autocapitalize: "off",
      autocorrect: "off",
    });
  const grammar = (mode: "json" | "markdown" | "circuitkit") =>
    mode === "json"
      ? json()
      : mode === "circuitkit"
        ? circuit
        : markdown({
            codeLanguages: (info) =>
              info === "circuitkit" ? circuit : info === "json" ? json().language : null,
          });
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: options.value,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightActiveLine(),
        history(),
        bracketMatching(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        syntaxHighlighting(colors),
        attributes.of(attrs(options.invalid)),
        language.of(grammar(options.language)),
        wrapping.of([]),
        EditorView.theme({
          "&": { color: "var(--syntax-text)", backgroundColor: "var(--syntax-background)" },
          ".cm-scroller": {
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
            fontSize: "14px",
            lineHeight: "24px",
            overflow: "auto",
          },
          ".cm-content": { padding: "16px 0", caretColor: "var(--foreground)" },
          ".cm-line": { padding: "0 16px" },
          ".cm-gutters": {
            backgroundColor: "var(--syntax-background)",
            color: "var(--syntax-comment)",
            borderRight: "1px solid var(--line)",
          },
          ".cm-activeLine, .cm-activeLineGutter": { backgroundColor: "transparent" },
          "&.cm-focused": { outline: "2px solid var(--ring)", outlineOffset: "-2px" },
        }),
        EditorView.updateListener.of((update) => {
          if (
            update.docChanged &&
            !update.transactions.some((transaction) => transaction.annotation(external))
          )
            options.onChange(update.state.doc.toString());
        }),
      ],
    }),
  });
  view.scrollDOM.tabIndex = 0;
  view.scrollDOM.setAttribute("aria-label", "Source viewport");
  view.scrollDOM.setAttribute("role", "region");
  let mode = options.language;
  let invalid = options.invalid;
  let wrap = false;
  return {
    update(
      value: string,
      nextMode: typeof mode,
      nextInvalid: boolean,
      nextWrap: boolean,
      nextLabel: string,
    ) {
      if (view.state.doc.toString() !== value)
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: value },
          annotations: external.of(true),
        });
      if (mode !== nextMode) {
        mode = nextMode;
        view.dispatch({ effects: language.reconfigure(grammar(mode)) });
      }
      if (invalid !== nextInvalid || label !== nextLabel) {
        invalid = nextInvalid;
        label = nextLabel;
        view.dispatch({ effects: attributes.reconfigure(attrs(invalid)) });
      }
      if (wrap !== nextWrap) {
        wrap = nextWrap;
        view.dispatch({ effects: wrapping.reconfigure(wrap ? EditorView.lineWrapping : []) });
      }
    },
    select(from: number, to: number) {
      const start = Math.max(0, Math.min(from, view.state.doc.length));
      const end = Math.max(start, Math.min(to, view.state.doc.length));
      view.dispatch({
        selection: { anchor: start, head: end },
        effects: EditorView.scrollIntoView(start, { y: "center" }),
      });
      view.focus();
      view.dom.scrollIntoView({ block: "nearest" });
    },
    destroy() {
      view.destroy();
    },
  };
}
