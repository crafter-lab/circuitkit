"use client";

import { useEffect, useRef, useState } from "react";
import type { StressProgress, StressReport } from "./stress.ts";

type WorkerResponse =
  | { type: "progress"; progress: StressProgress }
  | { type: "done"; report: StressReport }
  | { type: "error"; message: string };
type WorkerFailure = { kind: "construction" | "runtime" | "message"; message: string };
type RunState =
  | { status: "idle" }
  | { status: "running"; progress: StressProgress | null }
  | { status: "cancelled"; progress: StressProgress | null }
  | { status: "completed"; report: StressReport }
  | { status: "error"; progress: StressProgress | null; error: WorkerFailure };

function reportJSON(value: unknown): string {
  return JSON.stringify(
    value,
    (_key, item: unknown) => {
      if (typeof item === "number" && (!Number.isFinite(item) || Object.is(item, -0))) {
        return { $number: Object.is(item, -0) ? "-0" : String(item) };
      }
      if (item === undefined) return { $undefined: true };
      return item;
    },
    2,
  );
}

export default function StressPanel() {
  const [state, setState] = useState<RunState>({ status: "idle" });
  const [downloadFeedback, setDownloadFeedback] = useState("");
  const activeWorker = useRef<Worker | null>(null);
  const downloadURL = useRef<string | null>(null);

  useEffect(
    () => () => {
      activeWorker.current?.terminate();
      activeWorker.current = null;
      if (downloadURL.current) URL.revokeObjectURL(downloadURL.current);
      downloadURL.current = null;
    },
    [],
  );

  function run() {
    activeWorker.current?.terminate();
    activeWorker.current = null;
    if (downloadURL.current) URL.revokeObjectURL(downloadURL.current);
    downloadURL.current = null;
    setDownloadFeedback("");
    setState({ status: "running", progress: null });
    let worker: Worker;
    try {
      worker = new Worker(new URL("./stress.worker.ts", import.meta.url), { type: "module" });
    } catch (error) {
      setState({
        status: "error",
        progress: null,
        error: {
          kind: "construction",
          message: error instanceof Error ? error.message : String(error),
        },
      });
      return;
    }
    activeWorker.current = worker;
    function fail(error: WorkerFailure) {
      if (activeWorker.current !== worker) return;
      activeWorker.current = null;
      worker.terminate();
      setState((current) => ({
        status: "error",
        progress: current.status === "running" ? current.progress : null,
        error,
      }));
    }
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      if (activeWorker.current !== worker) return;
      const message = event.data;
      if (message.type === "progress") {
        setState({ status: "running", progress: message.progress });
      } else if (message.type === "done") {
        activeWorker.current = null;
        worker.terminate();
        setState({ status: "completed", report: message.report });
      } else if (message.type === "error") {
        fail({ kind: "runtime", message: message.message });
      }
    };
    worker.onerror = (event) => {
      event.preventDefault();
      fail({
        kind: "runtime",
        message: event.message || "The worker could not load or stopped unexpectedly.",
      });
    };
    worker.onmessageerror = () =>
      fail({ kind: "message", message: "The browser could not decode a worker response." });
    try {
      worker.postMessage({ type: "run" });
    } catch (error) {
      fail({ kind: "message", message: error instanceof Error ? error.message : String(error) });
    }
  }

  function cancel() {
    activeWorker.current?.terminate();
    activeWorker.current = null;
    setState((current) =>
      current.status === "running" ? { status: "cancelled", progress: current.progress } : current,
    );
  }

  function download() {
    if (state.status !== "completed") return;
    let link: HTMLAnchorElement | undefined;
    try {
      if (downloadURL.current) URL.revokeObjectURL(downloadURL.current);
      downloadURL.current = null;
      const url = URL.createObjectURL(
        new Blob([`${reportJSON(state.report)}\n`], { type: "application/json;charset=utf-8" }),
      );
      downloadURL.current = url;
      link = document.createElement("a");
      link.href = url;
      link.download = "circuit-figures-stress-report.json";
      document.body.append(link);
      link.click();
      setDownloadFeedback(
        "JSON report download requested. Nonfinite numbers, negative zero, and undefined use tagged encoding.",
      );
    } catch (error) {
      if (downloadURL.current) URL.revokeObjectURL(downloadURL.current);
      downloadURL.current = null;
      setDownloadFeedback(
        `Report download failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      link?.remove();
    }
  }

  const progress =
    state.status === "completed" ? state.report : state.status === "idle" ? null : state.progress;
  const summary =
    state.status === "idle"
      ? "Ready when you are."
      : state.status === "running"
        ? progress
          ? "Running in a background worker. Keep browsing."
          : "Starting worker. Waiting for the first measured result."
        : state.status === "cancelled"
          ? "Cancelled. Counts show only the last reported work, not a completed result."
          : state.status === "error"
            ? `Worker ${state.error.kind} error: ${state.error.message}`
            : state.report.ok
              ? "Complete. All checks passed, including expected rejections."
              : "Complete. Unexpected failures need inspection.";

  return (
    <section className="stress-panel" aria-labelledby="stress-heading">
      <div className="stress-header">
        <div>
          <span className="eyebrow">Put the renderer through its paces</span>
          <h2 id="stress-heading">Small circuits. Serious checks.</h2>
          <p>
            Run the gallery and numeric boundary matrix locally. Check determinism, unchanged
            inputs, connectivity, and focus geometry.
          </p>
        </div>
        <div className="gallery-actions">
          <button
            type="button"
            className="primary"
            onClick={run}
            disabled={state.status === "running"}
          >
            {state.status === "idle"
              ? "Run stress test"
              : state.status === "running"
                ? "Running stress test"
                : "Run stress test again"}
          </button>
          {state.status === "running" ? (
            <button type="button" onClick={cancel}>
              Cancel
            </button>
          ) : null}
          {state.status === "completed" ? (
            <button type="button" onClick={download}>
              Download JSON report
            </button>
          ) : null}
        </div>
      </div>
      <p
        className={`stress-status ${state.status === "error" || (state.status === "completed" && !state.report.ok) ? "is-fail" : ""}`}
        role="status"
        aria-live="polite"
      >
        {summary}
      </p>
      {state.status !== "idle" ? (
        <>
          <progress
            aria-label="Stress test completion"
            max={progress?.total || 1}
            value={progress ? progress.completed : state.status === "running" ? undefined : 0}
          />
          <dl className="stress-counters">
            <div>
              <dt>Completed / total</dt>
              <dd>
                {progress?.completed ?? 0}
                <span> / {progress?.total ?? "pending"}</span>
              </dd>
            </div>
            <div>
              <dt>Passed</dt>
              <dd>{progress?.passed ?? 0}</dd>
            </div>
            <div>
              <dt>Unexpected failures</dt>
              <dd>{progress?.failed ?? 0}</dd>
            </div>
            <div>
              <dt>Rendered</dt>
              <dd>{progress?.rendered ?? 0}</dd>
            </div>
            <div>
              <dt>Rejected</dt>
              <dd>{progress?.rejected ?? 0}</dd>
            </div>
            <div>
              <dt>Measured elapsed</dt>
              <dd>{progress ? `${(progress.elapsedMs / 1000).toFixed(2)} s` : "Pending"}</dd>
            </div>
          </dl>
          {progress?.currentCase ? (
            <p className="stress-current">
              Last reported: <code>{progress.currentCase}</code>
            </p>
          ) : null}
        </>
      ) : null}
      <p className="stress-note">
        Passing does not mean every input renders. An expected rejection is a passing check, not a
        renderer bug. Cancelled or errored runs cannot export a complete report.
      </p>
      {downloadFeedback ? (
        <p className="stress-note" role="status">
          {downloadFeedback}
        </p>
      ) : null}
      {state.status === "completed" && state.report.failures.length > 0 ? (
        <div className="stress-failures">
          <h3>Unexpected failures / {state.report.failures.length}</h3>
          <p>
            Expand a case for its original input, expected outcome, and diagnostic pointers. These
            inputs are also included in the report.
          </p>
          {state.report.failures.map((failure) => (
            <details key={failure.id}>
              <summary>
                <code>{failure.id}</code>
                <span>{failure.invariants.length} failed checks</span>
              </summary>
              <ul>
                {failure.invariants.map((reason, index) => (
                  <li key={`${index}-${reason}`}>{reason}</li>
                ))}
              </ul>
              {failure.id.startsWith("gallery/") ? (
                <a
                  href={`/gallery/view?case=${encodeURIComponent(failure.id.slice("gallery/".length))}`}
                >
                  Inspect gallery case
                </a>
              ) : null}
              <pre>
                {reportJSON({
                  expectation: failure.expectation,
                  diagnostics: failure.diagnostics,
                  document: failure.document,
                })}
              </pre>
            </details>
          ))}
        </div>
      ) : null}
    </section>
  );
}
