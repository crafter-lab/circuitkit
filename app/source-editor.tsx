"use client";

import { useEffect, useRef, useState } from "react";
import type { mountSourceEditor } from "./source-editor-engine.ts";
import "./source-editor.css";

type Props = {
  id: string;
  value: string;
  label: string;
  invalid: boolean;
  onChange: (value: string) => void;
  language?: "json" | "markdown" | "circuitkit";
  describedBy?: string;
  selection?: { from: number; to: number; key: number };
  minimal?: boolean;
  lineWrapping?: boolean;
};

export default function CodeEditor(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const fallback = useRef<HTMLTextAreaElement>(null);
  const editor = useRef<ReturnType<typeof mountSourceEditor> | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const [ready, setReady] = useState(false);
  const [localWrap, setWrap] = useState(false);
  const wrap = props.lineWrapping ?? localWrap;
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let disposed = false;
    import("./source-editor-engine.ts")
      .then(({ mountSourceEditor }) => {
        if (disposed || !host.current) return;
        const current = latest.current;
        const focused = fallback.current === document.activeElement;
        const anchor = fallback.current?.selectionStart ?? 0;
        const head = fallback.current?.selectionEnd ?? anchor;
        editor.current = mountSourceEditor(host.current, {
          ...current,
          language: current.language ?? "markdown",
          onChange: (value) => latest.current.onChange(value),
        });
        setReady(true);
        if (focused)
          requestAnimationFrame(() => {
            if (!disposed) editor.current?.select(anchor, head);
          });
      })
      .catch(() => {
        if (!disposed) setFailed(true);
      });
    return () => {
      disposed = true;
      editor.current?.destroy();
      editor.current = null;
    };
  }, []);
  useEffect(() => {
    editor.current?.update(
      props.value,
      props.language ?? "markdown",
      props.invalid,
      wrap,
      props.label,
    );
  }, [props.value, props.language, props.invalid, wrap, ready, props.label]);
  useEffect(() => {
    const selection = props.selection;
    if (!selection) return;
    if (editor.current) editor.current.select(selection.from, selection.to);
    else {
      fallback.current?.focus();
      fallback.current?.setSelectionRange(selection.from, selection.to);
    }
  }, [props.selection, ready]);
  return (
    <div className={`code-editor${props.minimal ? " code-editor-minimal" : ""}`}>
      {!props.minimal ? (
        <div className="code-editor-bar">
          <span>
            {props.language === "json"
              ? "JSON"
              : props.language === "circuitkit"
                ? "CircuitKit"
                : "Markdown + CircuitKit"}
          </span>
          <button type="button" aria-pressed={wrap} onClick={() => setWrap(!wrap)}>
            Wrap lines
          </button>
        </div>
      ) : null}
      <div ref={host} hidden={!ready} className="source-engine" />
      {!ready ? (
        <textarea
          ref={fallback}
          id={props.id}
          aria-label={props.label}
          value={props.value}
          wrap={wrap ? "soft" : "off"}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          aria-invalid={props.invalid}
          aria-describedby={props.describedBy}
          onChange={(event) => props.onChange(event.currentTarget.value)}
        />
      ) : null}
      <div className="code-editor-status">
        <span>
          {props.value.split("\n").length} lines · {props.value.length.toLocaleString("en-US")}{" "}
          characters
        </span>
        <span>
          {failed ? "Plain text fallback · source preserved" : "Tab moves focus · ⌘/Ctrl+Z to undo"}
        </span>
      </div>
    </div>
  );
}
