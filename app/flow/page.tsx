import Link from "next/link";
import FlowDemo from "./flow-demo.tsx";
import "./flow.css";

export const metadata = {
  title: "Flow highlights | CircuitKit",
  description:
    "An illustrative, interactive current-direction highlight. Not an electrical simulation.",
};

export default function FlowPage() {
  return (
    <main id="main" className="flow-page">
      <div className="flow-intro">
        <div>
          <span className="eyebrow">Interactive prototype</span>
          <h1>Follow the circuit.</h1>
          <p>
            A quiet highlight, not a stream of dots. Open the switch and watch the route change.
          </p>
        </div>
        <Link href="/markdown" prefetch={false}>
          Back to Markdown →
        </Link>
      </div>
      <FlowDemo />
      <p className="flow-scope">
        One hand-composed scene to test the interaction. This prototype does not animate arbitrary
        CircuitKit documents, solve current, or model switch transients. Existing exports are
        unchanged.
      </p>
    </main>
  );
}
