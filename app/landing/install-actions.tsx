"use client";

import { type ReactNode, useId, useState } from "react";

export async function copyInstallCommand(
  command: string,
  clipboard: Pick<Clipboard, "writeText"> | undefined = globalThis.navigator?.clipboard,
): Promise<"copied" | "failed"> {
  try {
    if (!clipboard) return "failed";
    await clipboard.writeText(command);
    return "copied";
  } catch {
    return "failed";
  }
}

export function InstallCopyStatus({
  id,
  status,
}: {
  id: string;
  status: "idle" | "copying" | "copied" | "failed";
}) {
  return (
    <p id={id} className="landing-copy-status" role="status" aria-live="polite">
      {status === "copied"
        ? "Command copied."
        : status === "failed"
          ? "Could not copy. Select the command above and copy it manually."
          : ""}
    </p>
  );
}

export function InstallCommand({
  label,
  command,
  children,
  highlightedHTML,
  regionLabel = label,
}: {
  label: string;
  command: string;
  children?: ReactNode;
  highlightedHTML?: string;
  regionLabel?: string;
}) {
  const id = useId();
  const [status, setStatus] = useState<"idle" | "copying" | "copied" | "failed">("idle");

  async function copy() {
    setStatus("copying");
    setStatus(await copyInstallCommand(command));
  }

  return (
    <div className="landing-code-panel landing-install-command">
      <div className="landing-panel-label">
        <span>{label}</span>
        <button
          type="button"
          className="landing-button"
          aria-label={`Copy ${label}`}
          aria-describedby={`${id}-status`}
          disabled={status === "copying"}
          onClick={copy}
        >
          {status === "copying" ? "Copying…" : "Copy command"}
        </button>
      </div>
      <section className="landing-code-scroll" tabIndex={0} aria-label={regionLabel}>
        {highlightedHTML ? (
          <div dangerouslySetInnerHTML={{ __html: highlightedHTML }} />
        ) : (
          <pre>
            <code>{children ?? command}</code>
          </pre>
        )}
      </section>
      <InstallCopyStatus id={`${id}-status`} status={status} />
    </div>
  );
}
