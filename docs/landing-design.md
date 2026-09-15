# CircuitKit landing

## Identity and distribution

CircuitKit is the app brand; the package and CLI are `circuitkit`, with optional `circuitkit/react`. Source code is [Apache-2.0 licensed](../LICENSE); [NOTICE](../NOTICE) and [third-party licenses](../THIRD_PARTY_LICENSES.md) preserve upstream attribution, including bundled fonts. The public source repository is https://github.com/crafter-lab/circuitkit. Repository creation was verified through GitHub; npm publication and deployment are separate actions.

CircuitKit is not published to npm. The root package's `private: true` is an intentional guard against accidental registry publication, not a restriction on the Apache-licensed source. The landing presents local source builds and tarball consumption without changing the gallery corpus, lesson documents or core renderer contracts.

## Design sources

- [Crafter design guidelines](https://crafter.run/design.md).
- [Crafter UI theme](https://ui.crafter.run/r/theme.json), the palette and control-token reference.

The design uses the existing Next.js/React stack, native anchors/buttons, and local Geist/Geist Mono fonts. Server-rendered content, conditional loading of the editor, a narrow client theme/figure boundary, and memoized figure documents keep the interactive surface small without a component-library migration.

## Composition and behavior

A compact masthead links CircuitKit, Crafter Lab, editor, gallery, and lesson. The main introduction pairs “Open editor” with “Explore gallery” at the same 32px desktop control height. Supporting text explains the tool before showing a real annotated voltage divider, not a mock drawing or dashboard.

The hero reuses `dividerLesson` unchanged and `CircuitLessonFigure` directly. That shared component owns hit testing, transient hover/focus previews, Escape/Show all, accessible legend associations, and SVG downloads. `LandingFigure` owns the selected net and reads the global site theme through `useSiteTheme()`, mapping it to the existing `geist-light`/`geist-dark` document presets. There are no duplicate wires or annotation interaction implementations. Selection stays intact when the theme changes; exports use saved selection rather than transient previews.

Three concise value propositions cover electrical nodes, portable SVG, and the local author/agent contract. The topology count and links are derived from `getCatalog().recipes`, currently nine. Gallery/stress/test counts are deliberately absent. The code example uses the actual core API and handles both success and diagnostics.

Source instructions explicitly state that CircuitKit is not published to npm. They show cloning the public repository, `cd circuitkit`, `bun install`, and `bun run build`. `bun run dev` is explained separately. Package imports assume a built local tarball is installed in the consumer; the landing never suggests a registry install is available. See the [source-build and local-package instructions](guide.md) for the complete workflow.

The footer includes Apache-2.0 and source links. The limitation statement excludes simulation, electrical-safety certification, and fabrication. No social proof, security certification, or production guarantees are invented.

## Theme, layout, and accessibility

The shared-layout architecture moves site light/dark tokens into `app/globals.css` and applies the Crafter visual language across landing, editor, gallery, detail, and lesson. The `html` and `body` backgrounds use the same global token, including the dark root class, so the document canvas is themed rather than only the landing wrapper. `app/landing/landing.css` retains landing-specific composition, not a separate theme boundary. Renderer SVG colors and authored figure documents remain independent of site chrome; the site toggle must not rewrite editor JSON, gallery preset filters, detail SVG, or downloads. Lesson figure-theme controls remain document controls.

`RootLayout` owns `AppThemeProvider`, one skip link targeting `#main`, `SiteHeader`, route content, and `SiteFooter`. Each page remains a Server Component with exactly one `main#main` and no local site header, footer, or skip link. The root landing uses a plain `.landing` wrapper instead of `LandingShell`. Editor delegation remains a conditional async import only when the root receives a `case` parameter.

`AppThemeProvider` uses `next-themes` with `attribute="class"`, system-theme support, color-scheme handling, and the `circuitkit-theme` storage key. Its initialization script precedes content and resolves the HTML theme class. `useSiteTheme()` uses a `useSyncExternalStore` mounted guard: SSR and the first hydration render expose light with `mounted: false`, independently of the HTML class initialized by the script. The shared “Dark theme” button is initially disabled with `aria-pressed="false"`; after mounting it reflects the resolved theme and allows persistent user selection. Browser persistence, navigation, hydration, and overscroll behavior require browser verification, not just static SSR assertions.

The header, content, and footer share one alignment grid. Groups use 4–8px, related content 12–16px, and sections 24–32px spacing. Borders are fine, corners square, and surfaces have no elevation. Keyboard focus uses one outline. Desktop main actions are 32px; coarse-pointer controls expand to 44px. Small screens stack the hero, values, topology list, and code sections. Code and the shared diagram scroll inside their own containers rather than widening the page.

## Routes and compatibility

- `/`: the new landing when `case` is absent, including unrelated query parameters.
- `/editor`: the complete original editor, including default example, document controls, JSON/schema/catalog, validation, focus, copy, and SVG export.
- `/editor?case=...`: canonical gallery-to-editor handoff, with the existing origin link and original input preserved.
- `/?case=...`: conditional delegation to the same editor, preserving existing document links without redirecting or normalizing inputs.
- Unknown, empty, or repeated `case` values still produce the editor's 404 instead of silently displaying a default figure.
- App wordmarks return to `/`; all Editor navigation points to `/editor`.

All routes use the same CircuitKit masthead and footer through the root layout. Page-specific headings, editor schema/catalog/playground controls, full-corpus gallery ordering and filters, detail connectivity and exports, and the two independent lesson figures remain page content. Site styling changes do not alter those data or interaction contracts.

## Verification scope

`tests/site-shell.test.tsx` composes the real `AppThemeProvider`, `SiteHeader`, page content, and `SiteFooter` for SSR without mocking Next.js navigation or links. It checks one content main per page, shared branding/navigation, deterministic pre-mount theme controls, the unchanged light hero SVG, dark authored detail bytes and JSON, gallery preset filters, and editor/lesson content. Root layout wiring is inspected as source to avoid importing the `next/font/local` build macro; CSS assertions cover the root/background token contract, not computed browser appearance. Existing landing and gallery-route tests retain legacy/canonical editor parity, 404s, corpus ordering, filters, exports, and renderer-byte checks. No SVG snapshots or the 27 immutable pre-annotation hashes are regenerated.

The following results belong to the earlier landing implementation on 2026-09-15, before the shared-layout theme migration. They are historical evidence, not verification of the current global provider, persistence, all-route styling, or overscroll behavior:

```sh
bun run typecheck --incremental false
bun test tests/landing.test.tsx tests/gallery-routes.test.ts tests/editor.test.ts tests/lesson-figure.test.tsx tests/annotations.test.ts tests/react.test.tsx
```

The implementation agent reported both commands passing with exit 0: typechecking succeeded, and the six-file test run had 235 passed, 0 failed and 22,052 assertions. Coverage includes product/source copy, live catalog links/count, byte-identical hero SVG, deterministic initial SSR and accessible associations, the core example contract, unrelated queries, legacy/new editor parity, malformed case rejection, branding/navigation and the 27 pre-annotation SVG fixtures. Counts are historical observations, not required totals for future runs.

A focused Biome check also passed with exit 0, checking 10 files without fixes:

```sh
./node_modules/.bin/biome check app/page.tsx app/editor/page.tsx app/landing/landing-client.tsx app/landing/landing.css app/layout.tsx app/gallery/page.tsx app/gallery/view/page.tsx app/lesson/page.tsx tests/gallery-routes.test.ts tests/landing.test.tsx
```

Integration verification on 2026-09-15 also passed:

- `bun run test`: exit 0, 1,281 tests, 72,516 assertions across 12 files. The script uses the explicit `./tests` directory so temporary dependency caches cannot be collected as test-name matches.
- `bun run build` and `bun run build:web`: exit 0; library/CLI and all web routes compiled.
- `bun pm pack --destination artifacts` and `bun scripts/verify-package.ts`: exit 0; the renamed package installed in isolated consumers, preserved CLI/core/React parity and ran core without React.
- `bun scripts/check-landing.ts`: exit 0, 27 browser checks. Selection, hover, keyboard focus, Enter/Escape, theme changes and exported SVG bytes passed. Editor/gallery/lesson round trips and legacy root case links passed. No uncaught page exceptions were reported.
- Light and dark layouts stayed within the viewport at 320, 390, 768 and 1440 pixels. Paired desktop actions measured 32 pixels high on the same row. Four axe audits, covering both themes at desktop and narrow widths, reported zero automatic violations. Each audit retained one incomplete `color-contrast` rule for the decorative theme glyph, plus horizontally clipped code at narrow widths. Complementary checks verified computed code/icon contrast of at least 4.5:1 and keyboard horizontal scrolling in both themes; the axe limitations are not represented as automatic passes.

The initial browser harness incorrectly treated programmatic focus after a mouse click as keyboard navigation. Sending Tab before the focus check exercises the component's intended `:focus-visible` behavior; the assertion was retained and the renderer was not changed. Initial broad test discovery collected third-party dependency tests; explicit-directory discovery fixed the command rather than hiding project test failures.

Screenshots and machine-readable reports are generated under ignored `artifacts/landing/`. Verification uses Chromium and resized viewports, not physical mobile devices or cross-browser certification. Captured download Blob bytes are verified, not the operating system's download destination. See [testing](testing.md) for reproducible commands and opt-in browser checks.
