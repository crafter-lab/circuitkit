"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { copyInstallCommand as copyText } from "./install-actions.tsx";

export default function SkillCTA({
  prompt,
  placement = "Introduction",
}: {
  prompt: string;
  placement?: string;
}) {
  const id = useId();
  const [status, setStatus] = useState<"idle" | "copying" | "copied" | "failed">("idle");
  const [expanded, setExpanded] = useState(false);
  async function copy() {
    setStatus("copying");
    const result = await copyText(prompt);
    setStatus(result);
    if (result === "failed") setExpanded(true);
  }
  return (
    <div className="skill-cta">
      <div className="narrative-actions">
        <button
          type="button"
          className="narrative-primary"
          disabled={status === "copying"}
          aria-busy={status === "copying"}
          onClick={copy}
          aria-describedby={id}
        >
          Copy prompt
        </button>
        <Link
          href="/editor?mode=circuitkit&example=audio-story"
          prefetch={false}
          className="narrative-secondary"
        >
          Try the playground →
        </Link>
      </div>
      <p id={id} className="skill-copy-status" role="status" aria-live="polite">
        {status === "copied"
          ? "Copied. Paste into your agent, then share your circuit idea."
          : status === "failed"
            ? "Clipboard unavailable. Select the prompt below and copy it."
            : status === "copying"
              ? "Copying prompt…"
              : "Paste into your coding agent, then describe your circuit."}
      </p>
      <details
        className="agent-prompt-preview"
        open={expanded}
        onToggle={(event) => setExpanded(event.currentTarget.open)}
      >
        <summary>View prompt</summary>
        <textarea
          aria-label={`${placement}: CircuitKit setup prompt`}
          readOnly
          spellCheck={false}
          rows={10}
          value={prompt}
          onFocus={(event) => event.currentTarget.select()}
        />
      </details>
    </div>
  );
}
