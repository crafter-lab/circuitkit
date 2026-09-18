import type { NextConfig } from "next";

const config: NextConfig = {
  poweredByHeader: false,
  outputFileTracingIncludes: {
    "/*": ["./agent-skills/*.md", "./docs/**/*.md", "./examples/diagrams/*.ck"],
  },
  distDir: process.env.CIRCUITKIT_NEXT_DIST_DIR || ".next",
};

export default config;
