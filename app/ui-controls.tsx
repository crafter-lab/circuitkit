"use client";

import { type ReactNode, useEffect, useRef } from "react";
import "./ui-controls.css";

const paths = {
  play: "m8 5 11 7-11 7Z",
  pause: "M8 5v14M16 5v14",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  expand: "M9 3H3v6M15 3h6v6M3 15v6h6M21 15v6h-6",
  fit: "M3 9h6V3M21 9h-6V3M9 21v-6H3M15 21v-6h6",
  download: "M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4",
  chevron: "m8 10 4 4 4-4",
  code: "m8 6-6 6 6 6m8-12 6 6-6 6",
  replay: "M3 10a9 9 0 1 1 2 9M3 4v6h6",
  arrow: "M4 12h16m-6-6 6 6-6 6",
  sun: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1",
};
export function UIIcon({ name }: { name: keyof typeof paths }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={name === "more" ? 4 : 1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={paths[name]} />
    </svg>
  );
}

export function ToolMenu({
  label,
  children,
  icon = "more",
  text,
}: {
  label: string;
  children: ReactNode;
  icon?: keyof typeof paths;
  text?: string;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !ref.current?.contains(event.target) && ref.current)
        ref.current.open = false;
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && ref.current?.open) {
        const ownsFocus = ref.current.contains(document.activeElement);
        ref.current.open = false;
        if (ownsFocus) ref.current.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", onEscape);
    };
  }, []);
  return (
    <details
      className="ck-menu"
      ref={ref}
      onKeyDown={(event) => {
        if (event.key === "Escape" && ref.current?.open) {
          ref.current.open = false;
          ref.current.querySelector("summary")?.focus();
        }
      }}
      onBlur={(event) => {
        if (ref.current && !event.currentTarget.contains(event.relatedTarget))
          ref.current.open = false;
      }}
      onClick={(event) => {
        if (
          event.target instanceof Element &&
          event.target.closest("[data-menu-close]") &&
          ref.current
        )
          ref.current.open = false;
      }}
    >
      <summary
        className={`ck-tool ${text ? "ck-tool-text" : "ck-icon-button"}`}
        aria-label={label}
        title={label}
      >
        <UIIcon name={icon} />
        {text ? <span>{text}</span> : null}
      </summary>
      <div className="ck-menu-panel">{children}</div>
    </details>
  );
}
