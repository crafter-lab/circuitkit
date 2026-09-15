import { runStress, type StressProgress, type StressReport } from "./stress.ts";

type WorkerResponse =
  | { type: "progress"; progress: StressProgress }
  | { type: "done"; report: StressReport }
  | { type: "error"; message: string };

const worker = globalThis as unknown as {
  onmessage: ((event: MessageEvent<{ type: "run" }>) => void) | null;
  postMessage: (message: WorkerResponse) => void;
};

worker.onmessage = (event) => {
  if (event.data?.type !== "run") return;
  try {
    const runner = runStress();
    let next = runner.next();
    while (!next.done) {
      worker.postMessage({ type: "progress", progress: next.value });
      next = runner.next();
    }
    worker.postMessage({ type: "done", report: next.value });
  } catch (error) {
    worker.postMessage({
      type: "error",
      message: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    });
  }
};
