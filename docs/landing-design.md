# CircuitKit landing and agent workflow

## Direction

The landing follows one story: write a circuit, explain a connection, ship a real artifact. It is not a catalog of editor controls. The primary CTA copies `npx skills add crafter-lab/circuitkit --skill circuitkit`; a quiet link opens the playground. GitHub remains visible in the shared header, not as a competing hero CTA.

The repository skill is a discovery stub. The package includes a versioned core guide and specialized manuals exposed by `circuitkit skills list` and `circuitkit skills get core --text`. Agents generate local SVG/PNG previews instead of ASCII. npm installation and npx commands use the actual package name `circuitkit`; Node.js 20+ is the distribution runtime. Bun remains the repository toolchain.

## Design language

Follow https://crafter.run/design.md using the existing Next.js/React stack, Geist fonts, shared light/dark semantic colors and syntax tokens. Keep the same shell and alignment grid. Buttons and links in an action row align by their actual bounds. Code scrolls inside its container, never the page.

The default global button hover uses zero specificity through `:where(...)`. Component colors own their hover state; generic styling must not replace a primary background while leaving its inverse foreground behind. Verify computed contrast in normal, hover, keyboard focus and pending states in both themes. No new `!important` override is used.

Shiki highlights Bash and TypeScript on the server. Only highlighted HTML reaches the client story component. Generated text must round-trip without inserted line breaks and escape HTML-like source. Both themes use the same syntax variable names. Code snippets demonstrate supported Node APIs, not a Bun-only consumer contract.

## Real example and stable canvas

The Connect/Explain/Ship demo compiles `examples/diagrams/audio-story.ck`, a limited digital audio signal path. It deliberately omits power and is not a complete hardware circuit. Steps change the explanation, not the geometry. The shared viewer crops decorative export framing only in the browser; exported base figures remain unchanged. Flow is illustrative, not simulated current, and reduced motion uses static direction cues.

The playground is a source/canvas workspace with progressive export, source and canvas menus. Invalid source removes stale output. Scene status reserves space. The compact connection legend is descriptive rather than a row of filter buttons; overlapping grid descriptions reserve their maximum height and keyboard interactions remain on the diagram.

## Routes and agent access

- `/` tells the product story. Legacy `/?case=...` still delegates to the legacy editor and rejects invalid cases.
- `/editor?mode=circuitkit` is the focused source playground; old `/editor`, gallery and share URLs remain compatible.
- `/markdown` redirects to the playground. The CLI still accepts inert CircuitKit Markdown fences.
- `/llms.txt`, `/llms-full.txt`, `/index.md`, `/sitemap.md` and allowlisted `/docs/*` pages expose useful text, not private source files.
- `@vercel/agent-readability` negotiates Markdown for agents and explicit Markdown preferences while preserving explicit HTML and Next.js client navigation.
- Markdown responses carry content type, Vary, canonical Link, cache policy and ETag; unknown documentation returns true noncanonical 404s. The filesystem lookup is allowlisted.

## Verification

Test behavior, not marketing wording. Keep source/graph validation, immutable rendering, output safety, installed Node execution, clipboard rejection, route compatibility, no arbitrary document reads, content negotiation, SSR identity and accessibility. Do not freeze headline copy or button text in a unit test just to make layout changes expensive.

Automated browser checks cover actual computed styles, dimensions, syntax colors, clipboard outcomes, scenes, controls and narrow layouts. Accessibility audits retain incomplete findings separately from violations. A readability score is evidence about machine access, not a guarantee that the complete product is production-ready.

Release checks and screenshots are stored under ignored `artifacts/agent-release/`. Historical flow, presentation and benchmark artifacts are not substituted for verification of this revision. Package publication, source push and any deployment must each have their own observed receipt.
