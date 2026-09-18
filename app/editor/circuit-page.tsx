import { readFile } from "node:fs/promises";
import { join } from "node:path";
import Link from "next/link";
import CircuitEditor from "./circuit-editor.tsx";

export default async function CircuitPage({ example }: { example?: string } = {}) {
  const files = [
    { file: "audio-story.ck", label: "Audio signal path" },
    { file: "cueva-presentation.ck", label: "Cueva · full system" },
    { file: "cueva.ck", label: "Cueva · base circuit" },
    { file: "audio-system.ck", label: "Reusable audio" },
  ];
  const first = files.findIndex((entry) => entry.file === `${example}.ck`);
  const ordered =
    first > 0 ? [files[first], ...files.filter((_, index) => index !== first)] : files;
  const examples = await Promise.all(
    ordered.flatMap((entry) =>
      entry
        ? [
            readFile(join(process.cwd(), "examples", "diagrams", entry.file), "utf8").then(
              (source) => ({ label: entry.label, source }),
            ),
          ]
        : [],
    ),
  );
  return (
    <main id="main" className="studio-page">
      <div className="studio-heading">
        <div>
          <h1>Playground</h1>
          <p>Edit the source and preview your circuit.</p>
        </div>
        <Link href="/#install-skill" prefetch={false}>
          Use with your agent →
        </Link>
      </div>
      <CircuitEditor examples={examples} />
    </main>
  );
}
