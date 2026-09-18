import { Fragment } from "react";
import type { GradualHost } from "../../src/integrations/gradual.ts";
import type { MathRun } from "../../src/v2/schema.ts";

export function HostRuns({ runs }: { runs: readonly MathRun[] }) {
  return runs.map((run, index) => {
    const key = `${index}:${run.script}`;
    if (run.script === "sub") return <sub key={key}>{run.text}</sub>;
    if (run.script === "sup") return <sup key={key}>{run.text}</sup>;
    return <Fragment key={key}>{run.text}</Fragment>;
  });
}
export function HostContent({ host }: { host: GradualHost }) {
  return (
    <div className="education-host">
      {host.caption.length ? (
        <p>
          <HostRuns runs={host.caption} />
        </p>
      ) : null}
      {host.notes.length ? (
        <dl>
          {host.notes.map((note) => (
            <div key={note.id}>
              <dt>
                <HostRuns runs={note.label} />
              </dt>
              <dd>
                <HostRuns runs={note.value} />
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      {host.kind === "record" ? (
        <table>
          <caption>Public observation record</caption>
          <thead>
            <tr>
              <th scope="col">Field</th>
              <th scope="col">Observation</th>
              <th scope="col">State</th>
            </tr>
          </thead>
          <tbody>
            {host.record?.map((row) => (
              <tr key={row.id}>
                <th scope="row">
                  <HostRuns runs={row.label} />
                </th>
                <td>{row.missing ? "Missing" : <HostRuns runs={row.value} />}</td>
                <td>{row.flagged ? "Flagged" : "Not flagged"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {host.verdict?.length ? (
        <p>
          <HostRuns runs={host.verdict} />
        </p>
      ) : null}
    </div>
  );
}
