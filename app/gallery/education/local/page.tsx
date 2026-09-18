import Link from "next/link";
import "../../../education/education.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Local corpus comparison | CircuitKit" };
export function localComparisonURL(
  enabled: string | undefined,
  value: string | undefined,
): string | null {
  if (enabled !== "1" || !value) return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "http:" ||
      !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
      url.username ||
      url.password
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}
export default function LocalCorpusPage() {
  const url = localComparisonURL(
    process.env.CIRCUITKIT_LOCAL_CORPUS,
    process.env.CIRCUITKIT_LOCAL_COMPARISON_URL,
  );
  return (
    <main id="main" className="education-page">
      <div className="education-intro">
        <p className="education-eyebrow">Local only / Separate acceptance surface</p>
        <h1>The private corpus is not bundled.</h1>
        <p>
          The public gallery contains generic engine demonstrations. It is not acceptance evidence
          for the 344 exact Gradual source payloads, 652 occurrences or original-renderer
          comparisons.
        </p>
        <p>
          No raw source, solutions, corpus manifest or generated corpus images are imported by this
          app. The original comparison belongs in a separate isolated local consumer.
        </p>
        {url ? (
          <p>
            <a className="education-primary" href={url} rel="noreferrer">
              Open configured local comparison
            </a>
          </p>
        ) : (
          <p role="status">
            Local comparison is not configured. Set CIRCUITKIT_LOCAL_CORPUS=1 and
            CIRCUITKIT_LOCAL_COMPARISON_URL to an HTTP loopback result URL on the server. No
            comparison worker is started by this app. These are server-only variables, never
            NEXT_PUBLIC variables.
          </p>
        )}
        <p>
          Adapter functional projection and raster coverage is separate from original visual
          equivalence, keyboard QA and mobile layout acceptance. Inspect the isolated consumer’s
          actual results; no green coverage badge is inferred here.
        </p>
        <Link href="/gallery/education" prefetch={false}>
          Return to the public capability gallery
        </Link>
      </div>
    </main>
  );
}
