"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { copyInstallCommand } from "./install-actions.tsx";

export default function SkillCTA({
  command,
  placement = "Introduction",
}: {
  command: string;
  placement?: string;
}) {
  const id = useId();
  const [status, setStatus] = useState<"idle" | "copying" | "copied" | "failed">("idle");
  async function copy() {
    setStatus("copying");
    setStatus(await copyInstallCommand(command));
  }
  return (
    <div className="skill-cta">
      <div className="narrative-actions">
        <button
          type="button"
          className="narrative-primary"
          disabled={status === "copying"}
          onClick={copy}
          aria-describedby={id}
        >
          Install skill <span aria-hidden="true">↗</span>
        </button>
        <Link
          href="/editor?mode=circuitkit&example=audio-story"
          prefetch={false}
          className="narrative-secondary"
        >
          Try the playground →
        </Link>
      </div>
      <section
        className="skill-install-line"
        tabIndex={0}
        aria-label={`${placement}: skill installation command`}
      >
        <code>{command}</code>
      </section>
      <p id={id} className="skill-copy-status" role="status" aria-live="polite">
        {status === "copied"
          ? "Copied. Run it in your project to install the skill."
          : status === "failed"
            ? "Clipboard unavailable. Select and copy the command above."
            : "Copy the install command. Works with Codex, Claude Code and other agents."}
      </p>
    </div>
  );
}
